"""Shared schema building blocks."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    """Base for schemas read straight off a SQLAlchemy row."""

    model_config = ConfigDict(from_attributes=True)


class Page[T](BaseModel):
    """One page of a listing, with everything the UI needs to paginate."""

    items: list[T]
    total: int = Field(ge=0, description="Total matching records, ignoring pagination")
    page: int = Field(ge=1)
    per_page: int = Field(ge=1)

    @property
    def pages(self) -> int:
        return max(1, -(-self.total // self.per_page))


class Message(BaseModel):
    """A plain acknowledgement for actions with nothing to return."""

    detail: str
