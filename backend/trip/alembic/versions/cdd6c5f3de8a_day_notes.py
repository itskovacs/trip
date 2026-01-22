"""day notes

Revision ID: cdd6c5f3de8a
Revises: a1d9e8f592bf
Create Date: 2026-01-19 22:55:59.816486

"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "cdd6c5f3de8a"
down_revision = "a1d9e8f592bf"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("tripday", schema=None) as batch_op:
        batch_op.add_column(sa.Column("notes", sqlmodel.sql.sqltypes.AutoString(), nullable=True))


def downgrade():
    with op.batch_alter_table("tripday", schema=None) as batch_op:
        batch_op.drop_column("notes")
