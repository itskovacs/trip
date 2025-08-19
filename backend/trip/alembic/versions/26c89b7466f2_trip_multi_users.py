"""Trip multi-users

Revision ID: 26c89b7466f2
Revises: 60a9bb641d8a
Create Date: 2025-08-18 23:19:37.457354

"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "26c89b7466f2"
down_revision = "60a9bb641d8a"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "tripmember",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("invited_by", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("invited_at", sa.DateTime(), nullable=False),
        sa.Column("joined_at", sa.DateTime(), nullable=True),
        sa.Column("trip_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["invited_by"],
            ["user.username"],
            name=op.f("fk_tripmember_invited_by_user"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["trip_id"], ["trip.id"], name=op.f("fk_tripmember_trip_id_trip"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["user"], ["user.username"], name=op.f("fk_tripmember_user_user"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tripmember")),
    )
    with op.batch_alter_table("tripchecklistitem", schema=None) as batch_op:
        batch_op.drop_constraint(batch_op.f("fk_tripchecklistitem_user_user"), type_="foreignkey")
        batch_op.drop_column("user")

    with op.batch_alter_table("trippackinglistitem", schema=None) as batch_op:
        batch_op.drop_constraint(batch_op.f("fk_trippackinglistitem_user_user"), type_="foreignkey")
        batch_op.drop_column("user")

    with op.batch_alter_table("tripitem", schema=None) as batch_op:
        batch_op.drop_constraint(batch_op.f("fk_tripitem_day_id_tripday"), type_="foreignkey")

    with op.batch_alter_table("tripday", schema=None) as batch_op:
        batch_op.drop_constraint(batch_op.f("fk_tripday_user_user"), type_="foreignkey")
        batch_op.drop_column("user")

    with op.batch_alter_table("tripitem", schema=None) as batch_op:
        batch_op.create_foreign_key(
            batch_op.f("fk_tripitem_day_id_tripday"),
            "tripday",
            ["day_id"],
            ["id"],
            ondelete="CASCADE",
        )


def downgrade():
    with op.batch_alter_table("trippackinglistitem", schema=None) as batch_op:
        batch_op.add_column(sa.Column("user", sa.VARCHAR(), nullable=False))
        batch_op.create_foreign_key(
            batch_op.f("fk_trippackinglistitem_user_user"),
            "user",
            ["user"],
            ["username"],
            ondelete="CASCADE",
        )

    with op.batch_alter_table("tripday", schema=None) as batch_op:
        batch_op.add_column(sa.Column("user", sa.VARCHAR(), nullable=False))
        batch_op.create_foreign_key(
            batch_op.f("fk_tripday_user_user"), "user", ["user"], ["username"], ondelete="CASCADE"
        )

    with op.batch_alter_table("tripchecklistitem", schema=None) as batch_op:
        batch_op.add_column(sa.Column("user", sa.VARCHAR(), nullable=False))
        batch_op.create_foreign_key(
            batch_op.f("fk_tripchecklistitem_user_user"), "user", ["user"], ["username"], ondelete="CASCADE"
        )

    op.drop_table("tripmember")
