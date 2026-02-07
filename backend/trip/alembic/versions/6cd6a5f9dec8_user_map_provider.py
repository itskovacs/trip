"""user map provider

Revision ID: 6cd6a5f9dec8
Revises: cdd6c5f3de8a
Create Date: 2026-02-04 22:44:15.159738

"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "6cd6a5f9dec8"
down_revision = "cdd6c5f3de8a"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE user ADD COLUMN map_provider VARCHAR NOT NULL DEFAULT 'OPENSTREETMAP';")


def downgrade():
    with op.batch_alter_table("user", schema=None) as batch_op:
        batch_op.drop_column("map_provider")
