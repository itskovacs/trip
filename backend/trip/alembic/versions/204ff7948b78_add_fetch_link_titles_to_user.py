"""add fetch_link_titles to user

Revision ID: 204ff7948b78
Revises: f2a4b6c9d1e3
Create Date: 2026-08-20 00:00:00.000000

"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "204ff7948b78"
down_revision = "f2a4b6c9d1e3"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE user ADD COLUMN fetch_link_titles BOOLEAN NOT NULL DEFAULT 0;")


def downgrade():
    with op.batch_alter_table("user", schema=None) as batch_op:
        batch_op.drop_column("fetch_link_titles")
