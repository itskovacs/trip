"""fix paid_by integer

Revision ID: 06a43bee16cd
Revises: 59206f6e2440
Create Date: 2026-03-14 14:08:53.566421

"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "06a43bee16cd"
down_revision = "59206f6e2440"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("tripitem", schema=None) as batch_op:
        batch_op.alter_column(
            "paid_by", existing_type=sa.INTEGER(), type_=sa.String(), existing_nullable=True
        )


def downgrade():
    with op.batch_alter_table("tripitem", schema=None) as batch_op:
        batch_op.alter_column(
            "paid_by", existing_type=sa.String(), type_=sa.INTEGER(), existing_nullable=True
        )
