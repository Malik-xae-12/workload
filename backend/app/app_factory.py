from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.routing import APIRoute 
from fastapi_pagination import add_pagination

from app.core.config import settings
from app.core.csrf import CSRFMiddleware
from app.core.events import create_database
from app.core.exceptions import register_exception_handlers
from app.core.rate_limit import limiter
from app.modules.auth.router import router as auth_router
from app.modules.users.router import router as users_router
from app.modules.fabric.router import router as fabric_router
from app.modules.finin.core.events import check_azure_openai_connection
from app.modules.finin.mapping.router import router as finin_mapping_router
from app.modules.finin.chat.router import router as finin_chat_router
from app.shared.constants import AUTH_URL_PATH
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded


def simple_generate_unique_route_id(route: APIRoute) -> str:
    return f"{route.tags[0]}-{route.name}"


def create_app() -> FastAPI:
    app = FastAPI(
        generate_unique_id_function=simple_generate_unique_route_id,
        openapi_url=settings.OPENAPI_URL,
    )

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_event_handler("startup", create_database)
    app.add_event_handler("startup", check_azure_openai_connection)

    # CORS: use explicit CORS_ORIGINS if set, else fall back to FRONTEND_URL
    allowed_origins = (
        list(settings.CORS_ORIGINS)
        if settings.CORS_ORIGINS
        else [settings.FRONTEND_URL]
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.add_middleware(CSRFMiddleware)

    app.include_router(auth_router, prefix=f"/{AUTH_URL_PATH}")
    app.include_router(users_router, prefix="/users")

    app.include_router(fabric_router, prefix="/fabric")
    app.include_router(finin_mapping_router, prefix="/finin")
    app.include_router(finin_chat_router, prefix="/finin")

    register_exception_handlers(app)
    add_pagination(app)

    return app
