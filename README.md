# Microsoft Fabric Solution Accelerator — Workload & Application Guide

A comprehensive, production-grade Microsoft Fabric Solution Accelerator built as a **Native Microsoft Fabric Workload**. It provides automated Medallion Architecture provisioning (Bronze & Silver Lakehouses, Gold Warehouses, Metadata Warehouses), data ingestion pipelines, source connections, and automated stored procedures with seamless Microsoft Entra ID Single Sign-On (SSO).

---

## 🏗️ Architecture & Handshake Overview

### 1. High-Level System Architecture
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 1. Microsoft Fabric Portal (https://app.fabric.microsoft.com)                 │
│                                                                              │
│   ├── Fabric DevGateway (Dev Tunnel) connects to localhost:60006             │
│   │   └─ Registers NuPkg Manifest Package (e.g. Org.Accelerator.1.0.0.nupkg) │
│   │                                                                          │
│   └── 2. Renders Workload Shell (workload/HelloWorldItemEditor.tsx)           │
│       │  - Powered by @ms-fabric/workload-client SDK                         │
│       │  - Acquires Microsoft Entra ID Token silently via Fabric SSO         │
│       │                                                                      │
│       └── 3. Embeds Solution Accelerator (localhost:3000)                     │
│           │  - React + Vite Frontend                                         │
│           │  - Medallion Setup, Finin AI Mapping & Pipelines                 │
│           │                                                                  │
│           └── 4. Communicates with FastAPI Backend (localhost:8000)          │
│                  - SQLite / PostgreSQL Database                              │
│                  - Automated Fabric REST API Cloud Provisioning              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

### 2. End-to-End Extensibility & Authentication Handshake Flow

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│                              THE FABRIC WORKLOAD HANDSHAKE FLOW                              │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│  1. Configuration (WorkloadManifest.xml & .env.dev):                                         │
│     - Defines <AADFEApp><AppId>{{FRONTEND_APPID}}</AppId></AADFEApp>                         │
│     - Defines <ServiceEndpoint><Url>{{FRONTEND_URL}}</Url></ServiceEndpoint>                 │
│                                                                                              │
│  2. Compilation (BuildManifestPackage.ps1):                                                  │
│     - Injects FRONTEND_APPID & FRONTEND_URL into WorkloadManifest.xml                        │
│     - Validates XML schemas and outputs: build\Manifest\Org.Accelerator.1.0.0.nupkg          │
│                                                                                              │
│  3. Registration & Tunneling (StartDevGateway.ps1):                                          │
│     - DevGateway uploads the local .nupkg to Fabric Cloud Developer Mode for your Workspace  │
│     - Opens a secure Azure Relay WebSocket tunnel to http://127.0.0.1:60006/                 │
│                                                                                              │
│  4. Cloud Validation & Silent SSO (Fabric Portal):                                           │
│     - When you open Fabric, it matches the manifest AppId with your Entra ID App Registration│
│     - Verifies pre-authorized Fabric Cloud Client IDs (00000009-0000-0000-c000-000000000000)  │
│     - Verifies Redirect URIs (http://localhost:60006/close & /workloadSignIn/...)            │
│     - Fabric creates an <iframe> pointing to http://localhost:60006/ and silently passes     │
│       the user's Entra ID token via @ms-fabric/workload-client (bypassing popup blockers)    │
│                                                                                              │
│  5. Application Embedding:                                                                   │
│     - The Workload Shell (HelloWorldItemEditor.tsx) receives the token and embeds your       │
│       React Accelerator (http://localhost:3000) with complete SSO credentials!              │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Detailed Handshake Step Breakdown:
1. **Manifest Configuration:** `WorkloadManifest.xml` references `<AADFEApp>` (`FRONTEND_APPID`) and `<ServiceEndpoint>` (`http://localhost:60006/`).
2. **Package Build:** `BuildManifestPackage.ps1` replaces placeholders using `.env.dev`, validates XML against Microsoft schemas, and produces `build\Manifest\Org.Accelerator.1.0.0.nupkg`.
3. **Tunneling via DevGateway:** `StartDevGateway.ps1` registers this `.nupkg` with Microsoft Fabric for your specific development workspace and routes traffic from the cloud to `http://localhost:60006/`.
4. **Cloud Validation & Silent SSO:** Fabric Portal matches the registered App ID with Microsoft Entra ID. Because Fabric Cloud (`00000009-0000-0000-c000-000000000000`) is pre-authorized on the App Registration with redirect `http://localhost:60006/close`, Fabric generates silent tokens without browser popup blocking.
5. **Workload Host & Embedded App:** `HelloWorldItemEditor.tsx` receives the token via `@ms-fabric/workload-client` SDK and renders your React Solution Accelerator (`http://localhost:3000/`) inside the Fabric Portal!

---

## 📋 System Prerequisites

Ensure the following tools are installed on your development machine:

| Tool | Minimum Version | Installation Command (Windows) |
| :--- | :--- | :--- |
| **PowerShell 7+ (`pwsh`)** | 7.4+ | `winget install Microsoft.PowerShell` |
| **Node.js & npm** | v18+ or v20 LTS / v22+ | `winget install OpenJS.NodeJS.LTS` |
| **Python** | 3.10 to 3.12 | `winget install Python.Python.3.11` |
| **Azure CLI (`az`)** | Latest | `winget install Microsoft.AzureCLI` |
| **Git** | Latest | `winget install Git.Git` |

### ✅ Step 0: Pre-Flight System Check
Run the pre-flight checker script in PowerShell to verify all dependencies and runtime tools:

```powershell
pwsh -ExecutionPolicy Bypass -File "scripts\CheckPrerequisites.ps1"
```

---

## 🚀 Complete Setup Guide (From Scratch)

Follow these steps when setting up on a **brand new machine**, **new clone location**, or in a **brand new Microsoft Fabric tenant**:

### 1. Clone the Repository
```powershell
git clone <your-repository-url> fabric-solution-accelerator
cd fabric-solution-accelerator
```

---

### 2. Configure Environment & App Registrations (One-Time Wizard)
Run the interactive setup wizard to register your Entra ID application and initialize your development configuration:

```powershell
pwsh -ExecutionPolicy Bypass -File "scripts\Setup\SetupWorkload.ps1"
```

**During this setup, the wizard will:**
1. Authenticate you with Azure via Azure CLI (`az login`).
2. Prompt for your **Workload Name** (e.g. `Org.Accelerator`).
3. Automatically create and register the **Frontend Entra Application ID**.
4. Generate `workload\.env.dev`, `workload\.env.test`, and `workload\.env.prod`.
5. Download DevGateway binaries into `tools\DevGateway\`.
6. Prompt you for your **Fabric development Workspace GUID**.
7. Compile and build the initial Manifest NuGet package (`build\Manifest\*.nupkg`).

> **Tip:** If you ever need to re-run the wizard or overwrite existing `.env` files, pass `-Force $true`:
> ```powershell
> pwsh -ExecutionPolicy Bypass -File "scripts\Setup\SetupWorkload.ps1" -Force $true
> ```

---

### 3. Setup the FastAPI Backend (Port 8000)
```powershell
cd backend

# 1. Create Python virtual environment
python -m venv venv

# 2. Activate virtual environment
.\venv\Scripts\Activate.ps1

# 3. Install Python dependencies
pip install -r requirements.txt

# 4. Configure backend environment
# Ensure backend/.env contains your FABRIC_CLIENT_ID, FABRIC_CLIENT_SECRET, FABRIC_TENANT_ID, and FABRIC_CAPACITY_ID

cd ..
```

---

### 4. Setup the React Frontend (Port 3000)
```powershell
cd frontend

# Install frontend dependencies
npm install

cd ..
```

---

### 5. Setup the Workload Shell & Build Manifest Package
```powershell
cd workload

# Install workload dependencies (.npmrc is configured with legacy-peer-deps=true)
npm install

# Build the Workload Manifest NuPkg package
pwsh -ExecutionPolicy Bypass -File "..\scripts\Build\BuildManifestPackage.ps1" -Environment "dev"

cd ..
```

*(This compiles your workload `.nupkg` into `build\Manifest\`, which Fabric reads via DevGateway)*

---

## 🏃 Everyday Development: Running the 4 Services

To run the complete accelerator stack locally, open **4 terminal windows** in the root project directory:

### **Terminal 1: Fabric Workload DevServer (Port 60006)**
```powershell
cd D:\space\workload
pwsh -ExecutionPolicy Bypass -File "scripts\Run\StartDevServer.ps1"
```
*Hosts the DevServer on `http://127.0.0.1:60006/` and serves manifest endpoints `/manifests_new` & `/manifests_new/metadata`.*

---

### **Terminal 2: DevGateway (Fabric Dev Tunnel)**
```powershell
cd D:\space\workload
pwsh -ExecutionPolicy Bypass -File "scripts\Run\StartDevGateway.ps1"
```
*Connects your local machine to Microsoft Fabric cloud. It registers your local `.nupkg` package with Fabric and establishes the live dev tunnel.*

---

### **Terminal 3: FastAPI Backend (Port 8000)**
```powershell
cd D:\space\workload\backend
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```
*Handles database persistence, token verification, and Fabric REST API cloud automation.*

---

### **Terminal 4: React Frontend (Port 3000)**
```powershell
cd D:\space\workload\frontend
npm run dev
```
*Runs the Vite dev server with automatic backend proxying (`/auth`, `/fabric`, `/finin`).*

---

## 🌐 Opening Inside Microsoft Fabric Portal

1. Open **[app.fabric.microsoft.com](https://app.fabric.microsoft.com)** in Google Chrome or Microsoft Edge.
2. Click **⚙️ Settings (top right) ➔ Developer Settings**.
3. Toggle **Developer Mode ON**.
4. Navigate to any workspace assigned to a Fabric Capacity (or Trial).
5. Click **+ New item** and select your workload item (e.g. **Org.Accelerator (HelloWorld)**).
6. Fabric portal connects via DevGateway to your local DevServer at `http://127.0.0.1:60006/` and embeds your accelerator dashboard.
7. Click **"Sign in with Microsoft"** — Fabric will grant your token via Native SSO and take you directly into your projects!

---

## 🔧 Workspace Management

To switch or update the Fabric development workspace used by DevGateway at any time, run:
```powershell
pwsh -ExecutionPolicy Bypass -File "scripts\Setup\SetupDevEnvironment.ps1"
```
*(Or pass `-DevWorkspaceId "<your-workspace-guid>"` directly)*

---

## 📁 Repository Structure

```
fabric-solution-accelerator/
├── backend/                 # FastAPI backend server
│   ├── app/                 # Routers, services, models & auth handlers
│   ├── requirements.txt     # Python dependencies
│   └── .env                 # Backend environment variables & Service Principal
├── frontend/                # React 18 + Vite frontend application
│   ├── src/                 # Medallion UI, Finin AI mapping & router
│   ├── vite.config.ts       # Vite proxy config (routes /fabric, /auth -> 8000)
│   └── .env                 # Frontend client configuration
├── workload/                # Microsoft Fabric Workload Manifest & DevGateway host
│   ├── app/                 # Workload item editors & SDK handlers
│   ├── devServer/           # Webpack dev server & manifest API middleware
│   ├── Manifest/            # XML item & workload manifest templates (WorkloadManifest.xml)
│   ├── .env.dev             # Local workload environment settings
│   └── .npmrc               # legacy-peer-deps configuration
├── scripts/                 # Automation and lifecycle scripts
│   ├── CheckPrerequisites.ps1 # One-command pre-flight checker
│   ├── Setup/               # SetupWorkload.ps1, SetupDevEnvironment.ps1, CreateDevAADApp.ps1
│   ├── Build/               # BuildManifestPackage.ps1, BuildRelease.ps1
│   └── Run/                 # StartDevServer.ps1, StartDevGateway.ps1
├── tools/                   # DevGateway binaries & NuGet manifest tools
└── build/                   # Output folder for .nupkg packages & DevGateway config
```

---

## ❓ Troubleshooting & FAQ

#### Q: `npm install` runs out of memory (`JavaScript heap out of memory`) in `workload/`
**A:** In modern npm (v7–v11), npm tries to resolve conflicting peer dependencies across Fluent UI and React. A `.npmrc` file with `legacy-peer-deps=true` is included in `workload/` to avoid this. If running manually, ensure you pass:
```powershell
npm install --legacy-peer-deps
```

#### Q: `EADDRINUSE: 60006` when running `StartDevServer.ps1`
**A:** A previous DevServer process is still running and holding port 60006. To terminate existing node processes:
```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
```
Then re-run `StartDevServer.ps1`.

#### Q: Error `SP may not have Capacity Admin` / `502 Bad Gateway` when deploying Medallion
**A:** Fabric requires workspaces to have an active Fabric Capacity (or Trial) assigned to create Lakehouse/Warehouse items.
1. In [app.fabric.microsoft.com](https://app.fabric.microsoft.com), go to **⚙️ Admin Portal ➔ Capacity Settings ➔ Fabric Capacity**, select your capacity, and add your Service Principal under **Capacity administrators**.
2. Alternatively, open workspace settings in Fabric portal ➔ **License info** ➔ set license mode to **Fabric Capacity** manually.

#### Q: DevGateway says `Relay listener went offline` or `The server returned status code 404`
**A:** The registration token or relay connection expired. Simply stop DevGateway with `Ctrl + C` and re-run:
```powershell
pwsh -ExecutionPolicy Bypass -File "scripts\Run\StartDevGateway.ps1"
```
It will re-authenticate interactively, re-register your dev instance, and restore the connection.
