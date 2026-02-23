"""trip share full_access

Revision ID: ff887e5acce7
Revises: 40a1114835e1
Create Date: 2026-02-17 21:51:26.452025

"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "ff887e5acce7"
down_revision = "40a1114835e1"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("tripshare", schema=None) as batch_op:
        batch_op.add_column(sa.Column("is_full_access", sa.Boolean(), nullable=True))


def downgrade():
    with op.batch_alter_table("tripshare", schema=None) as batch_op:
        batch_op.drop_column("is_full_access")
