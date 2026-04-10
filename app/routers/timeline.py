"""
Case Timeline Router
====================
Extracts case events (filings, receipts, approvals, RFEs, etc.)
from uploaded USCIS documents and builds a visual timeline.
"""

from fastapi import APIRouter, UploadFile, File, Form, Request, HTTPException
from typing import Optional
import re
import logging

from app.utils.pdf_parser import PDFParser
from app.models.schemas import (
    CaseTimeline,
    TimelineEvent,
    TimelineEventType,
    CaseType,
)

logger = logging.getLogger(__name__)
router = APIRouter()
pdf_parser = PDFParser()


# ─── Event detection patterns ─────────────────────────────────────────

EVENT_PATTERNS = {
    TimelineEventType.RECEIPT: [
        r"(?i)receipt\s+notice",
        r"(?i)we\s+have\s+received\s+your",
        r"(?i)case\s+was\s+received",
        r"(?i)your\s+case\s+has\s+been\s+received",
    ],
    TimelineEventType.APPROVAL: [
        r"(?i)approval\s+notice",
        r"(?i)has\s+been\s+approved",
        r"(?i)petition\s+(?:has\s+been\s+|was\s+)?approved",
        r"(?i)your\s+case\s+(?:has\s+been\s+|was\s+)?approved",
    ],
    TimelineEventType.DENIAL: [
        r"(?i)denial\s+notice",
        r"(?i)has\s+been\s+denied",
        r"(?i)your\s+case\s+(?:has\s+been\s+|was\s+)?denied",
    ],
    TimelineEventType.RFE_ISSUED: [
        r"(?i)request\s+for\s+(?:additional\s+)?evidence",
        r"(?i)rfe",
        r"(?i)we\s+need\s+(?:additional|more)\s+(?:evidence|information)",
    ],
    TimelineEventType.BIOMETRICS: [
        r"(?i)biometric",
        r"(?i)fingerprint",
        r"(?i)ASC\s+appointment",
    ],
    TimelineEventType.INTERVIEW: [
        r"(?i)interview\s+(?:notice|scheduled|appointment)",
        r"(?i)you\s+are\s+scheduled\s+for\s+an\s+interview",
    ],
    TimelineEventType.TRANSFER: [
        r"(?i)case\s+(?:was\s+|has\s+been\s+)?transferred",
        r"(?i)transfer\s+notice",
    ],
    TimelineEventType.FILING: [
        r"(?i)(?:filed|submitted)\s+(?:on|with)\s+",
        r"(?i)date\s+of\s+filing",
        r"(?i)application\s+(?:was\s+)?(?:filed|submitted)",
    ],
}

# Date extraction pattern
DATE_REGEX = re.compile(
    r"\b(\d{1,2}/\d{1,2}/\d{4})\b"
    r"|"
    r"\b((?:January|February|March|April|May|June|July|August|"
    r"September|October|November|December)\s+\d{1,2},?\s+\d{4})\b"
)

# Receipt number pattern
RECEIPT_REGEX = re.compile(r"\b([A-Z]{3}\d{10})\b")

# Form number pattern
FORM_REGEX = re.compile(r"\b(I-\d{3}[A-Z]?|N-\d{3})\b", re.IGNORECASE)


@router.post("/extract", response_model=CaseTimeline)
async def extract_timeline(
    request: Request,
    file: UploadFile = File(...),
    client_name: Optional[str] = Form(None),
):
    """
    Extract a case timeline from a USCIS document (PDF).
    
    Automatically detects:
    - Event types (filing, receipt, approval, RFE, biometrics, etc.)
    - Dates associated with each event
    - Receipt numbers and form types
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are supported.",
        )

    pdf_bytes = await file.read()
    try:
        parsed = pdf_parser.parse_pdf_bytes(pdf_bytes, file.filename)
    except Exception as e:
        raise HTTPException(
            status_code=422,
            detail=f"Failed to parse PDF: {str(e)}",
        )

    # Extract events from the full text
    events = _extract_events(parsed.full_text, file.filename)

    # Sort events by date if available
    events.sort(key=lambda e: e.date or "9999-99-99")

    return CaseTimeline(
        client_name=client_name,
        case_type=(
            CaseType(parsed.metadata.detected_case_type)
            if parsed.metadata.detected_case_type
            else None
        ),
        receipt_number=(
            parsed.metadata.receipt_numbers[0]
            if parsed.metadata.receipt_numbers
            else None
        ),
        events=events,
        extracted_from=[file.filename],
    )


@router.post("/extract-multiple", response_model=CaseTimeline)
async def extract_timeline_multiple(
    request: Request,
    files: list[UploadFile] = File(...),
    client_name: Optional[str] = Form(None),
):
    """
    Extract and merge timelines from multiple USCIS documents.
    Useful for building a complete case history from separate notices.
    """
    all_events: list[TimelineEvent] = []
    filenames: list[str] = []
    all_receipt_numbers: list[str] = []
    detected_case_type = None

    for file in files:
        if not file.filename or not file.filename.lower().endswith(".pdf"):
            continue

        pdf_bytes = await file.read()
        try:
            parsed = pdf_parser.parse_pdf_bytes(pdf_bytes, file.filename)
        except Exception:
            logger.warning(f"Failed to parse {file.filename}, skipping")
            continue

        events = _extract_events(parsed.full_text, file.filename)
        all_events.extend(events)
        filenames.append(file.filename)
        all_receipt_numbers.extend(parsed.metadata.receipt_numbers)

        if parsed.metadata.detected_case_type and not detected_case_type:
            detected_case_type = parsed.metadata.detected_case_type

    # Deduplicate events by (type, date) pair
    seen = set()
    unique_events = []
    for event in all_events:
        key = (event.event_type, event.date, event.receipt_number)
        if key not in seen:
            seen.add(key)
            unique_events.append(event)

    unique_events.sort(key=lambda e: e.date or "9999-99-99")

    return CaseTimeline(
        client_name=client_name,
        case_type=CaseType(detected_case_type) if detected_case_type else None,
        receipt_number=all_receipt_numbers[0] if all_receipt_numbers else None,
        events=unique_events,
        extracted_from=filenames,
    )


def _extract_events(text: str, source_filename: str) -> list[TimelineEvent]:
    """
    Extract timeline events from document text using pattern matching.
    
    Strategy:
    1. Split text into paragraphs
    2. For each paragraph, check if it matches any event pattern
    3. Extract the nearest date and receipt number
    4. Create a TimelineEvent
    """
    paragraphs = re.split(r"\n\n+", text)
    events: list[TimelineEvent] = []

    for para in paragraphs:
        para_stripped = para.strip()
        if len(para_stripped) < 20:
            continue

        for event_type, patterns in EVENT_PATTERNS.items():
            matched = False
            for pattern in patterns:
                if re.search(pattern, para_stripped):
                    matched = True
                    break

            if matched:
                # Extract date from this paragraph
                date_match = DATE_REGEX.search(para_stripped)
                event_date = None
                if date_match:
                    event_date = date_match.group(0)

                # Extract receipt number
                receipt_match = RECEIPT_REGEX.search(para_stripped)
                receipt_number = receipt_match.group(0) if receipt_match else None

                # Extract form type
                form_match = FORM_REGEX.search(para_stripped)
                form_type = form_match.group(0).upper() if form_match else None

                # Create description (first 200 chars of matching paragraph)
                description = para_stripped[:200]
                if len(para_stripped) > 200:
                    description += "..."

                events.append(
                    TimelineEvent(
                        event_type=event_type,
                        date=event_date,
                        description=description,
                        receipt_number=receipt_number,
                        form_type=form_type,
                        source_document=source_filename,
                    )
                )
                break  # One event type per paragraph

    return events
