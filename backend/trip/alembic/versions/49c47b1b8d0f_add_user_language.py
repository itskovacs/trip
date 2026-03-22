"""add user language

Revision ID: 49c47b1b8d0f
Revises: bfbce549e783
Create Date: 2026-03-22 17:36:54.112271

"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "49c47b1b8d0f"
down_revision = "bfbce549e783"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("user", schema=None) as batch_op:
        batch_op.add_column(sa.Column("language", sqlmodel.sql.sqltypes.AutoString(), nullable=True))


def downgrade():
    with op.batch_alter_table("user", schema=None) as batch_op:
        batch_op.drop_column("language")
