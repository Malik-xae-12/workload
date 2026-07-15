from fastapi import FastAPI
from fastapi_pagination import add_pagination


def setup_pagination(app: FastAPI) -> None:
    add_pagination(app)
