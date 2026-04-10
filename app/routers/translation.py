"""
Translation Router
==================
Handles text and PDF document translation with USCIS certification.
"""

from fastapi import APIRouter, UploadFile, File, Form, Request, HTTPException
from typing import Optional
import time
import logging

from app.models.schemas import (
    TranslationRequest,
    TranslationResponse,
    DocumentTranslationResponse,
    SupportedLanguage,
)
from app.utils.pdf_parser import PDFParser

logger = logging.getLogger(__name__)
router = APIRouter()
pdf_parser = PDFParser()


@router.post("/text", response_model=TranslationResponse)
async def translate_text(request: Request, body: TranslationRequest):
    """
    Translate text between supported language pairs.
    
    Supports: Turkish, Spanish, Chinese, Arabic ↔ English
    Optionally generates a USCIS-compliant certification statement.
    """
    if body.source_lang == body.target_lang:
        raise HTTPException(
            status_code=400,
            detail="Source and target languages must be different.",
        )

    translation_service = request.app.state.translation

    try:
        result = translation_service.translate_text(
            text=body.text,
            source_lang=body.source_lang.value,
            target_lang=body.target_lang.value,
            generate_certification=body.generate_certification,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Translation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail="Translation failed. Please try again.",
        )

    return TranslationResponse(**result)


@router.post("/document", response_model=DocumentTranslationResponse)
async def translate_document(
    request: Request,
    file: UploadFile = File(...),
    source_lang: SupportedLanguage = Form(...),
    target_lang: SupportedLanguage = Form(default=SupportedLanguage.ENGLISH),
    generate_certification: bool = Form(default=True),
):
    """
    Translate an entire PDF document page by page.
    
    Returns translated text for each page with optional
    USCIS certification statement.
    """
    if source_lang == target_lang:
        raise HTTPException(
            status_code=400,
            detail="Source and target languages must be different.",
        )

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are supported.",
        )

    start_time = time.time()

    # Parse PDF
    pdf_bytes = await file.read()
    try:
        parsed = pdf_parser.parse_pdf_bytes(pdf_bytes, file.filename)
    except Exception as e:
        raise HTTPException(
            status_code=422,
            detail=f"Failed to parse PDF: {str(e)}",
        )

    # Prepare pages for translation
    pages = [
        {"page_number": page.page_number, "text": page.text}
        for page in parsed.pages
    ]

    # Translate all pages
    translation_service = request.app.state.translation
    try:
        translated_pages = translation_service.translate_pages(
            pages=pages,
            source_lang=source_lang.value,
            target_lang=target_lang.value,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    processing_time = (time.time() - start_time) * 1000

    # Generate certification if requested
    certification = None
    if generate_certification:
        total_words = sum(len(p["text"].split()) for p in pages)
        from app.services.translation import OPUS_MT_MODELS, LANGUAGE_NAMES
        model_id = OPUS_MT_MODELS.get(
            (source_lang.value, target_lang.value), "unknown"
        )
        certification = translation_service._generate_certification(
            source_lang=source_lang.value,
            target_lang=target_lang.value,
            word_count=total_words,
            model_id=model_id,
            document_description=file.filename,
        )

    return DocumentTranslationResponse(
        original_filename=file.filename,
        translated_pages=translated_pages,
        total_pages=len(translated_pages),
        certification_statement=certification,
        processing_time_ms=round(processing_time, 2),
    )


@router.get("/languages")
async def get_supported_languages(request: Request):
    """Get all supported language pairs and their models."""
    translation_service = request.app.state.translation
    return {
        "supported_pairs": translation_service.get_supported_languages(),
        "loaded_models": translation_service.get_loaded_models(),
        "languages": {
            "tr": "Turkish",
            "es": "Spanish",
            "zh": "Chinese",
            "ar": "Arabic",
            "en": "English",
        },
    }
