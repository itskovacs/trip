"""Notify feature: apprise webhook + checklist notify_dt

Revision ID: f2a4b6c9d1e3
Revises: 13fdb543d0e7
Create Date: 2026-08-10 22:14:11.699027

"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "f2a4b6c9d1e3"
down_revision = "13fdb543d0e7"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("user", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("apprise_webhook_url", sqlmodel.sql.sqltypes.AutoString(), nullable=True)
        )

    with op.batch_alter_table("tripchecklistitem", schema=None) as batch_op:
        batch_op.add_column(sa.Column("notify_dt", sa.DateTime(), nullable=True))

    with op.batch_alter_table("tripchecklistentry", schema=None) as batch_op:
        batch_op.add_column(sa.Column("notify_dt", sa.DateTime(), nullable=True))


def downgrade():
    with op.batch_alter_table("tripchecklistentry", schema=None) as batch_op:
        batch_op.drop_column("notify_dt")

    with op.batch_alter_table("tripchecklistitem", schema=None) as batch_op:
        batch_op.drop_column("notify_dt")

    with op.batch_alter_table("user", schema=None) as batch_op:
        batch_op.drop_column("apprise_webhook_url")
