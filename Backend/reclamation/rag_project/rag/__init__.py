"""
RAG service layer.

Pure Python, no Django views or models here. Each module does one step:

    loader.py      PDF  -> pages of clean text
    chunker.py     pages -> overlapping chunks (with page numbers)
    embeddings.py  text -> vectors        (OpenAI-compatible API)
    vectorstore.py vectors <-> ChromaDB
    retriever.py   question -> top-k relevant chunks
    prompts.py     chunks + question -> LLM messages
    llm.py         messages -> answer     (OpenAI-compatible API)
    pipeline.py    ask(question) -> answer + sources   (the public entry point)
"""
