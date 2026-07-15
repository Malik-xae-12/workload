#!/bin/bash
gunicorn -k uvicorn.workers.UvicornWorker -w 2 --timeout 120 --keep-alive 30 app.main:app