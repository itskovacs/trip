"""Trip ics token

Revision ID: a3f1c9d47b02
Revises: bbcac0ad52a6
Create Date: 2026-07-27 21:20:14.881233

"""

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "a3f1c9d47b02"
down_revision = "bbcac0ad52a6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("trip", sa.Column("ics_token", sa.String(), nullable=True))
    op.create_index(op.f("ix_trip_ics_token"), "trip", ["ics_token"], unique=True)


def downgrade():
    op.drop_index(op.f("ix_trip_ics_token"), table_name="trip")
    op.drop_column("trip", "ics_token")
