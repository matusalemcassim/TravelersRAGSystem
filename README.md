# 📖 Travelers RAG System
This project implements a **Retrieval-Augmented Generation (RAG) system** that combines a modern **Next.js frontend** with a **Node.js backend**, supported by **Neo4j** for graph-based knowledge retrieval and **PostgreSQL** for user management.  
- **Frontend**: Next.js (React) chat interface with visualizations  
- **Backend**: Node.js for API endpoints and RAG orchestration  
- **Database 1**: Neo4j (used for GraphRAG entity storage & retrieval)  
- **Database 2**: PostgreSQL (used for user authentication and session data)  
- **Deployment**: Dockerized services for easy setup and reproducibility  

---

## 📖 About the Project

The **Travelers RAG System** is designed to demonstrate how **Large Language Models (LLMs)** can be integrated with external knowledge bases to provide more accurate, context-aware answers.  

Instead of relying only on the LLM’s training data, this system retrieves relevant information from:
- **Neo4j** → used as a **GraphRAG database**, storing entities and relationships to enhance reasoning with graph structures.  
- **PostgreSQL** → stores **user credentials and session data**, ensuring secure authentication and persistence.  

The system uses a **Next.js chat interface** where users can log in, ask natural language questions, and receive results powered by the backend. The **Node.js backend** orchestrates the RAG pipeline, integrating LangChain/LangGraph with both databases and OpenAI’s API.  

### 🔎 What You Can Learn From This Project
By exploring this repository, you will learn:
- How to build a **full-stack GenAI application** (frontend + backend + databases).  
- How to integrate **LangChain/LangGraph** into a production-grade Node.js service.  
- How to design and query a **GraphRAG knowledge base** using Neo4j.  
- How to manage **user authentication** and sessions securely with PostgreSQL.  
- How to structure and containerize a multi-service project with **Docker Compose**.  
- How to separate secrets with `.env` files and follow **best practices** for security.  

This makes it an excellent **learning project** for anyone who wants to understand how to take RAG systems **from prototype to production**.

---
---

## 🚀 Features
- Natural language to database query processing (via LangChain / LangGraph)  
- GraphRAG knowledge base using **Neo4j**  
- PostgreSQL database for user accounts and session management  
- Secure `.env` support for API keys and database credentials  
- Clean separation of frontend (Next.js) and backend (Node.js)  
- Docker Compose for full project setup in one command  

---

## 📂 Project Structure

### 🗂️ Repository Layout
```plaintext
RAG/
├── rag-backend/                # Node.js backend service
│   ├── server.js               # Main backend server
│   ├── routes/                 # API endpoints
│   ├── controllers/            # Request handlers
│   ├── services/               # RAG orchestration (LangChain/LangGraph)
│   ├── models/                 # PostgreSQL + Neo4j models
│   ├── middleware/             # Auth, logging, error handling
│   ├── package.json            # Backend dependencies
│   └── ...
│
├── rag-frontend/               # Next.js frontend (React UI)
│   ├── app/                    # App router structure
│   ├── components/             # Reusable UI components
│   ├── pages/                  # API routes & page components
│   ├── public/                 # Static assets
│   ├── package.json            # Frontend dependencies
│   └── ...
│
├── ai_service.py               # LangGraph orchestration logic
├── docker-compose.yml          # Multi-service orchestration
├── .gitignore
├── .env.example                # Environment variable template
└── README.md

flowchart TD
    subgraph FE[Frontend Container: Next.js]
        A[Next.js UI]
    end

    subgraph BE[Backend Container: Node.js]
        B[Node.js API + LangGraph Service]
    end

    subgraph DB1[Database Container: PostgreSQL]
        C[(PostgreSQL - User Credentials)]
    end

    subgraph DB2[Database Container: Neo4j]
        D[(Neo4j - GraphRAG Database)]
    end

    subgraph API[External Service]
        E[(OpenAI API)]
    end

    A -->|REST/GraphQL calls| B
    B -->|User Auth| C
    B -->|Graph Queries| D
    B -->|LLM Requests| E

```
