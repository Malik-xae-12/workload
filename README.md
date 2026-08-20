# Microsoft Fabric Solution Accelerator — Workload & Application Guide

A comprehensive, production-grade Microsoft Fabric Solution Accelerator built as a **Native Microsoft Fabric Workload**. It provides automated Medallion Architecture provisioning (Bronze/Silver Lakehouses, Gold Warehouses, Metadata Warehouses), data ingestion pipelines, source connections, and automated stored procedures with seamless Entra ID Single Sign-On (SSO).

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Microsoft Fabric Portal (https://app.fabric.microsoft.com)                │
│                                                                             │
│   ├── Fabric DevGateway connects to localhost:60006                         │
│   │   └─ Serves NuPkg Manifest Package (Org.Malik.1.0.0.nupkg)              │
│   │                                                                         │
│   └── 2. Renders Workload Shell (workload/HelloWorldItemEditor.tsx)          │
│       │  - Powered by @ms-fabric/workload-client SDK                        │
│       │  - Acquires Microsoft Entra ID Token silently via Fabric SSO        │
│       │                                                                     │
│       └── 3. Embeds Solution Accelerator (localhost:3000)                    │
│           │  - React 18 + Vite Frontend                                     │
│           │  - Medallion Setup, Finin AI Mapping & Pipelines                │
│           │                                                                 │
│           └── 4. Communicates with FastAPI Backend (localhost:8000)         │
│                  - SQLite / PostgreSQL Database                             │
│                  - Automated Fabric REST API Cloud Provisioning             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📋 System Prerequisites

Ensure the following tools are installed on your machine:

| Tool | Minimum Version | Installation Command (Windows) |
| :--- | :--- | :--- |
| **PowerShell 7+ (`pwsh`)** | 7.4+ | `winget install Microsoft.PowerShell` |
| **Node.js & npm** | v18+ or v20 LTS | `winget install OpenJS.NodeJS.LTS` |
| **Python** | 3.10 to 3.12 | `winget install Python.Python.3.11` |
| **Azure CLI (`az`)** | Latest | `winget install Microsoft.AzureCLI` |
| **Git** | Latest | `winget install Git.Git` |

### ✅ Step 0: Pre-Flight System Check
Run this pre-flight script in PowerShell to verify all dependencies and configurations:

```powershell
pwsh -ExecutionPolicy Bypass -File "scripts\CheckPrerequisites.ps1"
```

---

## 🚀 Complete Brand New Setup (From Scratch)

Follow these steps when setting up on a **brand new computer** or in a **brand new Microsoft Fabric tenant**:

### 1. Clone the Repository
```powershell
git clone <your-repository-url> fabric-solution-accelerator
cd fabric-solution-accelerator
```

---

### 2. Run the Interactive Workload Setup Wizard
This script connects to your Azure/Fabric tenant, creates the Entra ID App Registrations, downloads the DevGateway tools, and generates your `.env.dev` configuration:

```powershell
pwsh -ExecutionPolicy Bypass -File "scripts\Setup\SetupWorkload.ps1"
```

**During this setup, the wizard will:**
1. Open a browser window to authenticate you with Azure (`az login`).
2. Prompt you to select your **Azure / Fabric Tenant**.
3. Prompt for your **Workload Name** (e.g. `Org.Malik`).
4. Automatically register the Frontend Entra Application ID (`CreateDevAADApp.ps1`).
5. Create `workload\.env.dev`, download DevGateway binaries, and compile the manifest package (`BuildManifestPackage.ps1`).

---

### 3. Setup the FastAPI Backend (Port 8000)
```powershell
cd backend

# 1. Create Python virtual environment
python -m venv venv

# 2. Activate virtual environment
.\venv\Scripts\Activate.ps1

# 3. Install Python packages
pip install -r requirements.txt
```

---

### 4. Setup the React Frontend (Port 3000)
```powershell
cd ..\frontend

# Install frontend dependencies
npm install
```

---

### 5. Setup the Workload Shell & Build Manifest Package
```powershell
cd ..\workload

# Install workload dependencies
npm install

# Build the Workload Manifest NuPkg package
pwsh -ExecutionPolicy Bypass -File "..\scripts\Build\BuildManifestPackage.ps1" -Environment "dev"
```

*(This compiles `Org.Malik.1.0.0.nupkg` into `build\Manifest\`, which Fabric reads via DevGateway)*

---

## 🏃 Everyday Development: Running the 3 Services

To run the full stack locally, open **3 terminal windows** in `fabric-solution-accelerator`:

### **Terminal 1: Fabric Workload Shell (Port 60006)**
```powershell
pwsh -ExecutionPolicy Bypass -File "scripts\Run\StartDevServer.ps1"
```
*Serves manifest endpoints `/manifests_new` & `/manifests_new/metadata` and the Fabric iframe host.*

### **Terminal 2: FastAPI Backend (Port 8000)**
```powershell
cd backend
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```
*Provides SQLite/Postgres persistence, token verification, and Fabric REST API automation.*

### **Terminal 3: React Frontend (Port 3000)**
```powershell
cd frontend
npm run dev
```
*Vite dev server with automatic backend proxying (`/auth`, `/fabric`, `/finin`).*

---

## 🌐 Opening Inside Microsoft Fabric Portal

1. Open **[app.fabric.microsoft.com](https://app.fabric.microsoft.com)** in Google Chrome or Microsoft Edge.
2. Click the **Settings icon (⚙️) -> Developer Settings**.
3. Toggle **Developer Mode ON**.
4. In any workspace assigned to a Fabric Capacity (or Trial), click **+ New item**.
5. Select your workload item: **Org.Malik (HelloWorld)**.
6. The portal will connect to `http://127.0.0.1:60006/` and embed your accelerator dashboard.
7. Click **"Sign in with Microsoft"** — Fabric will grant your token via Native SSO and take you directly into your projects!

---

## 📁 Repository Structure

```
fabric-solution-accelerator/
├── backend/                 # FastAPI backend server
│   ├── app/                 # Routers, services, models & auth handlers
│   ├── requirements.txt     # Python dependencies
│   └── .env                 # Backend environment variables
├── frontend/                # React 18 + Vite frontend application
│   ├── src/                 # Medallion UI, Finin AI mapping & router
│   ├── vite.config.ts       # Vite proxy config (routes /fabric, /auth -> 8000)
│   └── .env                 # Frontend client configuration
├── workload/                # Microsoft Fabric Workload Manifest & DevGateway host
│   ├── app/                 # Workload item editors & SDK handlers
│   ├── Manifest/            # XML item & workload manifest templates
│   └── .env.dev             # Local workload environment settings
├── scripts/                 # Automation and lifecycle scripts
│   ├── CheckPrerequisites.ps1 # One-command pre-flight checker
│   ├── Setup/               # SetupWorkload.ps1, CreateDevAADApp.ps1
│   ├── Build/               # BuildManifestPackage.ps1
│   └── Run/                 # StartDevServer.ps1, StartDevGateway.ps1
├── tools/                   # NuGet manifest packaging binaries
└── build/                   # Output folder for .nupkg packages & DevGateway
```

---

## ❓ Frequently Asked Questions (FAQ)

#### Q: Why is Workspace ID required?
**A:** In Microsoft Fabric, all cloud items (Lakehouses, Warehouses, Pipelines, Notebooks) are contained within a Fabric Workspace. The accelerator needs the Workspace GUID so its automated deployment APIs know where to provision the resources.

#### Q: What is the purpose of the App Registration?
**A:** 
- **Frontend App ID**: Identifies your workload to Fabric so it can securely issue user SSO tokens without popup blockers.
- **Backend App ID / Secret**: Acts as a Service Principal so the FastAPI backend can call Fabric REST APIs (`https://api.fabric.microsoft.com`) to create Lakehouses, Warehouses, and Pipelines in the customer tenant on their behalf.

#### Q: What if I switch to another tenant?
**A:** Run `scripts\Setup\SetupWorkload.ps1` to log into the new tenant and generate updated `.env` files, or update `AZURE_AD_TENANT_ID` and `AZURE_AD_CLIENT_ID` in your `.env` files and re-run `BuildManifestPackage.ps1`.
