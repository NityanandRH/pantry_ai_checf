# PantryChef — Setup & Run Instructions

---

## Folder Structure

Create this exact folder structure and place each file accordingly:

```
pantry-chef/
│
├── .env                          ← YOU CREATE THIS (see Step 1 below)
├── requirements.txt
│
├── backend/
│   ├── app.py
│   ├── models.py
│   └── prompts.py
│
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    └── src/
        ├── main.jsx
        ├── index.css
        ├── App.jsx
        ├── Inventory.jsx
        └── RecipeBuilder.jsx
```

> pantry.db will be AUTO-CREATED inside backend/ on first run. Do not create it manually.

---

## Prerequisites

Make sure these are installed on your machine before starting:

| Tool       | Version  | Check command         |
|------------|----------|-----------------------|
| Python     | 3.11+    | python --version      |
| pip        | latest   | pip --version         |
| Node.js    | 18+      | node --version        |
| npm        | 9+       | npm --version         |

---

## Step 1 — Create your .env file

Inside the root pantry-chef/ folder, create a file named exactly: .env
Add this single line:

```
OPENAI_API_KEY=sk-your-actual-key-here
```

Replace sk-your-actual-key-here with your real OpenAI API key.
Never share or commit this file.

---

## Step 2 — Install Python dependencies

Open Terminal 1. Navigate to the backend folder:

```bash
cd pantry-chef/backend
pip install -r ../requirements.txt
```

This installs: fastapi, uvicorn, openai, sqlalchemy, python-dotenv, pillow, python-multipart

---

## Step 3 — Start the backend server

Still in Terminal 1, run:

```bash
uvicorn app:app --reload --port 8000
```

You should see:
  INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
  INFO:     Application startup complete.

pantry.db will be created automatically inside backend/ on first run.

Leave this terminal running.

---

## Step 4 — Install frontend dependencies

Open Terminal 2. Navigate to the frontend folder:

```bash
cd pantry-chef/frontend
npm install
```

This installs: react, react-dom, axios, vite, tailwindcss, and related packages.

---

## Step 5 — Start the frontend

Still in Terminal 2, run:

```bash
npm run dev
```

You should see:
  VITE v5.x.x  ready in Xms
  ➜  Local:   http://localhost:5173/

Open http://localhost:5173 in your browser.

---

## Verify everything is working

1. Open http://localhost:5173 — you should see the PantryChef app with two tabs
2. Open http://localhost:8000/docs — you should see the FastAPI Swagger UI with all endpoints
3. Add one ingredient in My Pantry tab — it should appear in the table instantly
4. Go to Cook tab — click "Cook something today" — you should get a recipe

---

## To stop the servers

- Backend:  Press CTRL+C in Terminal 1
- Frontend: Press CTRL+C in Terminal 2

---

## To restart after stopping

Terminal 1:
```bash
cd pantry-chef/backend
uvicorn app:app --reload --port 8000
```

Terminal 2:
```bash
cd pantry-chef/frontend
npm run dev
```

No reinstall needed — just these two commands each time.

---

## Common issues

| Problem                              | Fix                                                      |
|--------------------------------------|----------------------------------------------------------|
| ModuleNotFoundError                  | Run pip install -r ../requirements.txt again             |
| OPENAI_API_KEY not set               | Check .env file is in pantry-chef/ root, not backend/    |
| Port 8000 already in use             | Kill the process or use --port 8001 and update vite.config.js |
| npm install fails                    | Make sure Node.js 18+ is installed                       |
| Frontend shows blank page            | Open browser console — check for errors                  |
| Backend not reachable from frontend  | Make sure uvicorn is running on port 8000                |
