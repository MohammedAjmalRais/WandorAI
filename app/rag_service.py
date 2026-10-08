import json
import re
from typing import Dict, AsyncGenerator, Optional

from langchain_chroma import Chroma
from langchain_groq import ChatGroq
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.messages import SystemMessage, HumanMessage

from app.config import get_settings

# In-memory stores for session-based vector indices and complete raw itinerary text
_SESSION_STORES: Dict[str, Chroma] = {}
_SESSION_ITINERARIES: Dict[str, str] = {}
_EMBEDDINGS = None

def get_embeddings():
    global _EMBEDDINGS
    if _EMBEDDINGS is None:
        # Load strictly from local cache (zero network pings, zero HF warnings, faster startup)
        _EMBEDDINGS = HuggingFaceEmbeddings(
            model_name="all-MiniLM-L6-v2",
            model_kwargs={"local_files_only": True}
        )
    return _EMBEDDINGS

def init_vector_store(session_id: str, text: str) -> None:
    """Stores full itinerary text and indexes semantic chunks for the given session."""
    if not text or not text.strip():
        return
        
    _SESSION_ITINERARIES[session_id] = text.strip()

    # Split by paragraphs / sections with reasonable chunk sizes to preserve day integrity
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1200,
        chunk_overlap=150,
        separators=["\n## ", "\n### ", "\n\n", "\n", " "]
    )
    chunks = splitter.split_text(text)
    
    if chunks:
        embeddings = get_embeddings()
        vectorstore = Chroma.from_texts(chunks, embeddings)
        _SESSION_STORES[session_id] = vectorstore


async def query_itinerary_stream(session_id: str, query: str) -> AsyncGenerator[str, None]:
    """Retrieves relevant context and streams an expertly formatted response from Groq."""
    settings = get_settings()
    
    if not settings.groq_api_key:
        yield "Error: GROQ_API_KEY is not configured in the backend."
        return

    full_itinerary = _SESSION_ITINERARIES.get(session_id)
    vectorstore = _SESSION_STORES.get(session_id)

    if not full_itinerary and not vectorstore:
        yield "I don't have access to an active itinerary for this session. Please generate or load an itinerary first!"
        return

    # Modern Groq models (like gpt-oss-20b, llama-3.3-70b) easily support 8k-128k context windows.
    # An itinerary of under 35,000 characters (~7,000 tokens) is passed in full to guarantee
    # 100% chronological accuracy and eliminate fragmented chunk cross-contamination.
    if full_itinerary and len(full_itinerary) <= 35000:
        context = full_itinerary
    elif vectorstore:
        # Fallback to high-k similarity search if the itinerary is exceptionally large
        docs = vectorstore.similarity_search(query, k=5)
        context = "\n\n---\n\n".join(doc.page_content for doc in docs)
    else:
        context = full_itinerary or ""

    system_prompt = (
        "You are Wandor Assistant, a world-class, friendly AI travel concierge helping travelers with their trip. "
        "You have access to the user's complete personalized itinerary in the Context below.\n\n"
        "### STRICT INSTRUCTIONS FOR ANSWERING:\n"
        "1. STRICT CHRONOLOGY: When summarizing or explaining plans for any day, ALWAYS present events in strict chronological order from morning to night.\n"
        "2. NO RAW MARKDOWN TABLES: Never format daily itineraries as markdown tables (e.g., '| Time | Activity |'). Chat bubbles are narrow and tables are unreadable in mobile and chat drawers. Instead, use clean, beautiful bullet points.\n"
        "3. STRUCTURED TIME BLOCKS: When describing a day's itinerary, organize it clearly by time blocks:\n"
        "   - 🌅 **Morning (09:00 AM – 12:00 PM)**\n"
        "   - ☀️ **Afternoon (12:00 PM – 05:00 PM)**\n"
        "   - 🌙 **Evening & Night (06:00 PM onwards)**\n"
        "4. HIGHLIGHT KEY DETAILS: Bold the time, venue/attraction names, and include any estimated costs (e.g. ticket prices, meal costs) or transit tips mentioned in the itinerary.\n"
        "5. SCOPE & ACCURACY: Never mix activities from other days into the requested day. Only use the facts given in the context. If the user asks about something not in the itinerary, politely clarify that it's not part of their current plan.\n"
        "6. TONE: Warm, concise, conversational, and direct. Avoid repeating unnecessary boilerplate or overly long disclaimers at the end.\n\n"
        f"Context (User's Personalized Itinerary):\n{context}"
    )

    llm = ChatGroq(
        api_key=settings.groq_api_key,
        model_name=settings.groq_model,
        temperature=0.2,
        streaming=True
    )

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=query)
    ]

    async for chunk in llm.astream(messages):
        if chunk.content:
            yield chunk.content
