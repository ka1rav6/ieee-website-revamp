"""Versioned API router.

Public endpoints are unauthenticated reads; everything under /admin requires
a valid admin token through a single shared dependency.
"""

from fastapi import APIRouter, Depends

from app.api.v1 import auth, contact, public
from app.api.v1.admin import blogs as admin_blogs
from app.api.v1.admin import inbox as admin_inbox
from app.api.v1.admin import people as admin_people
from app.api.v1.admin import showcase as admin_showcase
from app.core.deps import get_current_admin

api_router = APIRouter()

api_router.include_router(public.router)
api_router.include_router(contact.router)
api_router.include_router(auth.router)

# Declaring the dependency on the parent router means a new admin endpoint is
# protected by default: it cannot be exposed by forgetting to add a guard.
admin_router = APIRouter(prefix="/admin", dependencies=[Depends(get_current_admin)])
admin_router.include_router(admin_blogs.router)
admin_router.include_router(admin_people.team_router)
admin_router.include_router(admin_people.alumni_router)
admin_router.include_router(admin_showcase.collaborations_router)
admin_router.include_router(admin_showcase.events_router)
admin_router.include_router(admin_showcase.ieee_day_router)
admin_router.include_router(admin_inbox.submissions_router)
admin_router.include_router(admin_inbox.settings_router)
admin_router.include_router(admin_inbox.uploads_router)

api_router.include_router(admin_router)

__all__ = ["api_router"]
