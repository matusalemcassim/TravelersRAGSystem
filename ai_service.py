import os
import json
import uuid
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
import uvicorn
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize LangSmith tracing
os.environ["LANGCHAIN_TRACING_V2"] = "true"
os.environ["LANGCHAIN_API_KEY"] = os.getenv("LANGCHAIN_API_KEY", "")
os.environ["LANGCHAIN_PROJECT"] = os.getenv("LANGCHAIN_PROJECT", "")

app = FastAPI(title="RAG AI Service", version="1.1.0")

# Initialize OpenAI client
llm = ChatOpenAI(
    model="gpt-3.5-turbo",
    temperature=0,  # Lower temperature for more consistent responses
    max_tokens=4000,   # Increased for better context handling
    api_key=os.getenv("OPENAI_API_KEY")
)

# Pydantic models
class RetrievedChunk(BaseModel):
    id: str
    text: str
    score: float
    searchType: str = None

class ConversationMessage(BaseModel):
    role: str  # 'user' or 'assistant'
    content: str
    timestamp: Optional[str] = None

class GenerationRequest(BaseModel):
    question: str
    retrievedChunks: List[RetrievedChunk] = []
    sessionId: Optional[str] = None
    conversationHistory: Optional[List[ConversationMessage]] = []
    maxTokens: int = 400

class GenerationResponse(BaseModel):
    answer: str
    tokensUsed: int
    model: str
    processingSteps: List[str]
    sessionId: str
    needsFollowUp: bool = False

class PermissionAwareResponse:
    @staticmethod
    def generate_permission_message(user, denied_chunks_count, question):
        if not user:
            return "Some information may require authentication. Please log in to access additional content."
        
        permission_messages = {
            'departmental': f"This information requires {user.department} department access or higher permissions.",
            'internal': "This information requires management-level access or internal permissions.",
            'confidential': "This information requires executive-level access."
        }
        
        base_message = f"I found {denied_chunks_count} relevant documents, but your current access level ({user.role}) doesn't permit viewing them."
        
        if user.role != 'admin':
            escalation = f" To access this information, please contact your department manager or request elevated permissions."
            return base_message + escalation
        
        return base_message

class EnhancedRAGAgent:
    def __init__(self):
        self.llm = llm
    
    def analyze_conversation_context(self, question: str, conversation_history: List[ConversationMessage]) -> Dict[str, Any]:
        """Analyze the conversation to understand context and intent."""
        analysis = {
            'is_follow_up': False,
            'question_type': 'new',
            'previous_topics': [],
            'context_needed': False,
            'summary_request': False
        }
        
        if not conversation_history:
            return analysis
        
        question_lower = question.lower().strip()
        
        # Detect follow-up patterns
        follow_up_patterns = [
            'and in total', 'in total', 'total?', 'overall?', 'combined?',
            'and what about', 'what about', 'also', 'additionally',
            'tell me more', 'more details', 'elaborate'
        ]
        
        analysis['is_follow_up'] = (
            any(pattern in question_lower for pattern in follow_up_patterns) or
            len(question.split()) <= 5 or
            question_lower.startswith(('and ', 'also ', 'what about ', 'how about '))
        )
        
        # Identify if it's a summary/total request
        analysis['summary_request'] = any(word in question_lower for word in ['total', 'overall', 'combined', 'sum', 'altogether'])
        
        # Extract topics from recent conversation
        recent_messages = conversation_history[-6:]  # Last 3 exchanges
        topics = set()
        
        for msg in recent_messages:
            content_lower = msg.content.lower()
            # Extract key domain topics
            if any(word in content_lower for word in ['charity', 'charitable', 'donation', 'donated']):
                topics.add('charitable_giving')
            if any(word in content_lower for word in ['insurance', 'policy', 'coverage', 'claim']):
                topics.add('insurance')
            if any(word in content_lower for word in ['travelers', 'company', 'corporation']):
                topics.add('company_info')
            if any(word in content_lower for word in ['golf', 'tournament', 'championship']):
                topics.add('golf_sponsorship')
            if any(word in content_lower for word in ['repurchase', 'acquisition', 'merger']):
                topics.add('corporate_actions')
            if any(word in content_lower for word in ['money', 'amount', 'cost', 'expense']):
                topics.add('financial_data')
        
        analysis['previous_topics'] = list(topics)
        analysis['context_needed'] = analysis['is_follow_up'] and len(topics) > 0
        
        return analysis
    
    def build_contextual_prompt(self, question: str, chunks: List[RetrievedChunk], 
                               conversation_history: List[ConversationMessage], 
                               context_analysis: Dict[str, Any]) -> List:
        """Build a contextual prompt that leverages conversation history and retrieved information."""
        
        # Prepare conversation context
        conversation_context = ""
        if conversation_history and context_analysis['is_follow_up']:
            conversation_context = "PREVIOUS CONVERSATION:\n"
            # Include last 3 exchanges for context
            for msg in conversation_history[-6:]:
                role_label = "USER" if msg.role == "user" else "ASSISTANT"
                conversation_context += f"{role_label}: {msg.content}\n"
            conversation_context += "\n"
        
        # Prepare retrieved information context
        info_context = "RETRIEVED INFORMATION:\n"
        for i, chunk in enumerate(chunks[:5], 1):
            chunk_preview = chunk.text[:300] + "..." if len(chunk.text) > 300 else chunk.text
            info_context += f"[Source {i} - ID: {chunk.id}]\n{chunk_preview}\n\n"
        
        # Create appropriate system message based on context
        if context_analysis['is_follow_up']:
            if context_analysis['summary_request']:
                system_message = """You are an AI assistant with access to conversation history and retrieved documents.

The user is asking for summary/total information as a follow-up to the previous conversation. Your task is to:

1. Review the previous conversation to understand what topic they're asking about
2. Look through ALL retrieved information for comprehensive data related to that topic
3. Provide a complete answer that synthesizes information across multiple sources
4. If asking for totals/sums, look for numerical data and add them up if appropriate
5. Be thorough but concise

IMPORTANT: Use both the conversation history AND retrieved information to provide a complete answer."""

            else:
                system_message = """You are an AI assistant with access to conversation history and retrieved documents.

This is a follow-up question building on the previous conversation. Your task is to:

1. Consider the context from the previous conversation
2. Use the retrieved information to extend or clarify the previous discussion
3. Provide additional relevant details that build on what was already discussed
4. Maintain continuity with the previous conversation

Be direct and informative while building on the established context."""

        else:
            system_message = """You are an AI assistant answering questions based on retrieved documents.

Provide a direct, comprehensive answer to the user's question using the retrieved information.

Guidelines:
- Answer the question completely and accurately
- Use specific details from the retrieved sources
- Be concise but thorough
- If multiple sources contain relevant information, synthesize them appropriately"""
        
        # Combine all context
        full_context = f"{conversation_context}{info_context}"
        
        messages = [
            SystemMessage(content=f"{system_message}\n\nCONTEXT:\n{full_context}"),
            HumanMessage(content=f"Current question: {question}")
        ]
        
        return messages
    
    def generate_response(self, question: str, chunks: List[RetrievedChunk], 
                         session_id: str = None, conversation_history: List[ConversationMessage] = None) -> GenerationResponse:
        """Generate enhanced response with full conversation awareness."""
        
        if not conversation_history:
            conversation_history = []
        
        # Analyze the conversation context
        context_analysis = self.analyze_conversation_context(question, conversation_history)
        
        processing_steps = [
            f"Analyzing question: '{question}'",
            f"Conversation history: {len(conversation_history)} messages",
            f"Retrieved chunks: {len(chunks)}",
            f"Question type: {context_analysis['question_type']}",
            f"Is follow-up: {context_analysis['is_follow_up']}",
            f"Previous topics: {context_analysis['previous_topics']}",
            f"Summary request: {context_analysis['summary_request']}"
        ]
        
        if not chunks:
            processing_steps.append("No chunks available - returning no context response")
            return GenerationResponse(
                answer="I don't have enough relevant information in the knowledge base to answer your question. Please try rephrasing or ask about a different topic.",
                tokensUsed=0,
                model="gpt-3.5-turbo",
                processingSteps=processing_steps,
                sessionId=session_id or str(uuid.uuid4()),
                needsFollowUp=False
            )
        
        try:
            # Build contextual prompt
            messages = self.build_contextual_prompt(question, chunks, conversation_history, context_analysis)
            
            processing_steps.append(f"Generated {len(messages)} contextual messages for LLM")
            
            # Get response from LLM
            response = self.llm.invoke(messages)
            answer = response.content.strip()
            
            # Extract token usage
            tokens_used = 0
            if hasattr(response, 'usage_metadata') and response.usage_metadata:
                tokens_used = response.usage_metadata.get('total_tokens', 0)
            elif hasattr(response, 'response_metadata') and response.response_metadata:
                usage = response.response_metadata.get('token_usage', {})
                tokens_used = usage.get('total_tokens', 0)
            
            processing_steps.append(f"Generated response successfully ({tokens_used} tokens)")
            
            # Determine if follow-up might be needed
            needs_follow_up = (
                'more information' in answer.lower() or 
                'additional details' in answer.lower() or
                len(answer.split()) < 20
            )
            
            return GenerationResponse(
                answer=answer,
                tokensUsed=tokens_used,
                model="gpt-3.5-turbo",
                processingSteps=processing_steps,
                sessionId=session_id or str(uuid.uuid4()),
                needsFollowUp=needs_follow_up
            )
            
        except Exception as e:
            processing_steps.append(f"Error generating response: {str(e)}")
            return GenerationResponse(
                answer="I encountered an error while generating a response. Please try rephrasing your question.",
                tokensUsed=0,
                model="gpt-3.5-turbo-error",
                processingSteps=processing_steps,
                sessionId=session_id or str(uuid.uuid4()),
                needsFollowUp=False
            )

# Initialize the enhanced agent
rag_agent = EnhancedRAGAgent()

@app.post("/generate", response_model=GenerationResponse)
async def generate_response(request: GenerationRequest):
    """Generate a response using the enhanced RAG agent with conversation memory."""
    try:
        if not os.getenv("OPENAI_API_KEY"):
            raise HTTPException(status_code=500, detail="OpenAI API key not configured")
        
        print(f"Received generation request:")
        print(f"  Question: {request.question}")
        print(f"  Chunks: {len(request.retrievedChunks)}")
        print(f"  History: {len(request.conversationHistory) if request.conversationHistory else 0}")
        print(f"  Session: {request.sessionId}")
        
        response = rag_agent.generate_response(
            question=request.question,
            chunks=request.retrievedChunks,
            session_id=request.sessionId,
            conversation_history=request.conversationHistory or []
        )
        
        print(f"Generated response: {len(response.answer)} characters, {response.tokensUsed} tokens")
        return response
        
    except Exception as e:
        session_id = request.sessionId or str(uuid.uuid4())
        print(f"Generation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")

@app.get("/health")
async def health_check():
    """Enhanced health check endpoint."""
    return {
        "status": "healthy",
        "service": "Enhanced RAG AI Service",
        "version": "1.1.0",
        "openai_configured": bool(os.getenv("OPENAI_API_KEY")),
        "langsmith_configured": bool(os.getenv("LANGCHAIN_API_KEY")),
        "langsmith_project": os.getenv("LANGCHAIN_PROJECT", "rag-system"),
        "langsmith_tracing": os.getenv("LANGCHAIN_TRACING_V2", "false"),
        "model": "gpt-3.5-turbo",
        "features": ["conversation_history", "context_analysis", "follow_up_detection"]
    }

if __name__ == "__main__":
    port = int(os.getenv("AI_PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port)