"""user duplicate distance

Revision ID: 40a1114835e1
Revises: 6cd6a5f9dec8
Create Date: 2026-02-10 19:14:01.269106

"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "40a1114835e1"
down_revision = "6cd6a5f9dec8"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("user", schema=None) as batch_op:
        batch_op.add_column(sa.Column("duplicate_dist", sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table("user", schema=None) as batch_op:
        batch_op.drop_column("duplicate_dist")
