import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field
from app.models.conversation import ConversationType


class MessageSenderInfo(BaseModel):
    id: uuid.UUID
    display_name: str
    email: str
    role: str
    status: Optional[str] = "AVAILABLE"
    status_text: Optional[str] = None


class ReplySnippet(BaseModel):
    id: uuid.UUID
    sender_name: str
    content: str


class ReactionSummary(BaseModel):
    emoji: str
    count: int
    user_ids: List[uuid.UUID]
    user_names: List[str]


class MessageResponse(BaseModel):
    id: uuid.UUID
    client_id: str
    conversation_id: uuid.UUID
    sender: MessageSenderInfo
    content: str
    is_edited: bool
    is_deleted: bool
    reply_to: Optional[ReplySnippet] = None
    reactions: List[ReactionSummary] = []
    created_at: datetime
    updated_at: datetime


class MessageCreateRequest(BaseModel):
    client_id: str = Field(..., max_length=64, description="Frontend generated idempotency ID")
    content: str = Field(..., min_length=1, max_length=10000)
    reply_to_id: Optional[uuid.UUID] = None


class MessageEditRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=10000)


class ConversationSummaryResponse(BaseModel):
    id: uuid.UUID
    type: ConversationType
    title: str
    slug: Optional[str] = None
    color: Optional[str] = None
    team_id: Optional[uuid.UUID] = None
    other_user: Optional[MessageSenderInfo] = None
    last_message: Optional[MessageResponse] = None
    unread_count: int = 0
    updated_at: datetime
    my_last_read_at: Optional[datetime] = None
    other_user_last_read_at: Optional[datetime] = None


class CreateDMRequest(BaseModel):
    target_user_id: uuid.UUID


class MarkReadResponse(BaseModel):
    conversation_id: uuid.UUID
    user_id: uuid.UUID
    last_read_at: datetime


class ReactionToggleRequest(BaseModel):
    emoji: str = Field(..., min_length=1, max_length=32)


class ReactionToggleResponse(BaseModel):
    message_id: uuid.UUID
    conversation_id: uuid.UUID
    emoji: str
    action: str  # "added" | "removed"
    reactions: List[ReactionSummary]
