"""add show_dog_tag to user

Revision ID: 95990b054e57
Revises: 0f6659dc9428
Create Date: 2026-05-16 22:07:27.374172

"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "95990b054e57"
down_revision = "0f6659dc9428"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE user ADD COLUMN show_dog_tag BOOLEAN NOT NULL DEFAULT 1;")


def downgrade():
    with op.batch_alter_table("user", schema=None) as batch_op:
        batch_op.drop_column("show_dog_tag")
