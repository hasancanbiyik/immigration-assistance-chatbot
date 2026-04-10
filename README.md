# Immigration Assistance ChatBot

A RAG-powered immigration law assistant with document Q&A, USCIS-compliant translation, and case timeline tracking.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  React Frontend                     │
│   ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│   │ Doc Q&A  │  │Translate │  │ Case Timeline    │  │
│   └────┬─────┘  └────┬─────┘  └────────┬─────────┘  │
└────────┼──────────────┼─────────────────┼───────────┘
         │              │                 │
┌────────┼──────────────┼─────────────────┼───────────┐
│        ▼              ▼                 ▼           │
│              FastAPI Backend                        │
│  ┌────────────┐ ┌────────────┐ ┌──────────────────┐ │
│  │/api/docs   │ │/api/trans  │ │/api/timeline     │ │
│  └─────┬──────┘ └─────┬──────┘ └────────┬─────────┘ │
│        │              │                 │           │
│  ┌─────▼──────┐ ┌─────▼──────┐ ┌───────▼─────────┐  │
│  │ ChromaDB   │ │ OPUS-MT    │ │ Regex + NLP     │  │
│  │ + BGE-M3   │ │ (TR/ES/ZH/ │ │ Event Extractor │  │
│  │ (RAG)      │ │  AR ↔ EN)  │ │                 │  │
│  └─────┬──────┘ └────────────┘ └─────────────────┘  │
│        │                                            │
│  ┌─────▼──────┐                                     │
│  │ Gemini     │                                     │
│  │ Free Tier  │                                     │
│  │ (Reasoning)│                                     │
│  └────────────┘                                     │
└─────────────────────────────────────────────────────┘
```

## Tech Stack

| Component       | Technology                          | License     |
|-----------------|-------------------------------------|-------------|
| Backend         | FastAPI                             | MIT         |
| Embeddings      | BAAI/bge-m3 (568M params)           | MIT         |
| Vector Store    | ChromaDB                            | Apache 2.0  |
| Translation     | Helsinki-NLP OPUS-MT (big variants) | Apache 2.0  |
| LLM Reasoning   | Gemini Free Tier                   | Google ToS  |
| PDF Parsing     | PyMuPDF                             | AGPL        |
| Frontend        | React + Tailwind + shadcn/ui        | MIT         |
| Containerization| Docker                              | Apache 2.0  |

## Quick Start

```bash
# 1. Create virtual environment
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run the API
uvicorn app.main:app --reload --port 8000

# 4. Open API docs
open http://localhost:8000/docs
```

## API Endpoints

### Document Q&A
- `POST /api/documents/upload` — Upload and process a PDF
- `POST /api/documents/ask` — Ask questions about uploaded documents
- `GET /api/documents/stats` — Collection statistics
- `DELETE /api/documents/{filename}` — Remove a document

### Translation
- `POST /api/translation/text` — Translate text with USCIS certification
- `POST /api/translation/document` — Translate entire PDF
- `GET /api/translation/languages` — Supported language pairs

### Case Timeline
- `POST /api/timeline/extract` — Extract timeline from single PDF
- `POST /api/timeline/extract-multiple` — Merge timelines from multiple PDFs

### System
- `GET /api/health` — Health check

## Running Tests

```bash
pytest tests/ -v
```

## Models

### Embedding: BGE-M3
- 568M parameters, runs on CPU or Apple Silicon
- Multilingual (EN/TR/ES/ZH/AR)
- Supports dense + sparse hybrid retrieval
- MIT license — safe for commercial use

### Translation: OPUS-MT
- Separate models per language pair (lazy-loaded)
- Turkish: `opus-mt-tc-big-tr-en` / `opus-mt-tc-big-en-tr`
- Spanish: `opus-mt-es-en` / `opus-mt-en-es`
- Chinese: `opus-mt-zh-en` / `opus-mt-en-zh`
- Arabic: `opus-mt-ar-en` / `opus-mt-en-ar`
- Apache 2.0 license

## Project Status

- [x] Backend scaffolding (FastAPI + 3 routers)
- [x] PDF parsing pipeline with immigration metadata extraction
- [x] Vector store service (ChromaDB + BGE-M3)
- [x] Translation service (OPUS-MT with USCIS certification)
- [x] Case timeline extraction
- [x] Pydantic schemas for all modules
- [x] Tests (13/13 passing)
- [x] Dockerfile
- [ ] Gemini integration for LLM reasoning
- [ ] React frontend
- [ ] Synthetic demo data
- [ ] HuggingFace Spaces deployment

## Author

Hasan Can Biyik — [Portfolio]([https://hasancanbiyik.com](https://hasancanbiyik.github.io/)) | [LinkedIn]([https://linkedin.com/in/hasancanbiyik](https://www.linkedin.com/in/hasancanbyk/))
