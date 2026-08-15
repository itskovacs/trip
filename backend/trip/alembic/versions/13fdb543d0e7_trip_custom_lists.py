"""Trip custom checklists and packing lists

Revision ID: 13fdb543d0e7
Revises: a3f1c9d47b02
Create Date: 2026-08-10 20:57:28.435057

"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "13fdb543d0e7"
down_revision = "a3f1c9d47b02"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "trippackinglist",
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("trip_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["trip_id"], ["trip.id"], name=op.f("fk_trippackinglist_trip_id_trip"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_trippackinglist")),
    )
    with op.batch_alter_table("trippackinglist", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_trippackinglist_trip_id"), ["trip_id"], unique=False)

    op.create_table(
        "trippackinglistentry",
        sa.Column("text", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("qt", sa.Integer(), nullable=True),
        sa.Column(
            "category",
            sa.Enum("CLOTHES", "TOILETRIES", "TECH", "DOCUMENTS", "OTHER", name="packinglistcategoryenum"),
            nullable=True,
        ),
        sa.Column("packed", sa.Boolean(), nullable=True),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("packing_list_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["packing_list_id"],
            ["trippackinglist.id"],
            name=op.f("fk_trippackinglistentry_packing_list_id_trippackinglist"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_trippackinglistentry")),
    )
    with op.batch_alter_table("trippackinglistentry", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_trippackinglistentry_packing_list_id"), ["packing_list_id"], unique=False
        )

    op.create_table(
        "tripchecklist",
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("trip_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["trip_id"], ["trip.id"], name=op.f("fk_tripchecklist_trip_id_trip"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tripchecklist")),
    )
    with op.batch_alter_table("tripchecklist", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_tripchecklist_trip_id"), ["trip_id"], unique=False)

    op.create_table(
        "tripchecklistentry",
        sa.Column("text", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("checked", sa.Boolean(), nullable=True),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("checklist_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["checklist_id"],
            ["tripchecklist.id"],
            name=op.f("fk_tripchecklistentry_checklist_id_tripchecklist"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tripchecklistentry")),
    )
    with op.batch_alter_table("tripchecklistentry", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_tripchecklistentry_checklist_id"), ["checklist_id"], unique=False
        )


def downgrade():
    with op.batch_alter_table("tripchecklistentry", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_tripchecklistentry_checklist_id"))
    op.drop_table("tripchecklistentry")

    with op.batch_alter_table("tripchecklist", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_tripchecklist_trip_id"))
    op.drop_table("tripchecklist")

    with op.batch_alter_table("trippackinglistentry", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_trippackinglistentry_packing_list_id"))
    op.drop_table("trippackinglistentry")

    with op.batch_alter_table("trippackinglist", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_trippackinglist_trip_id"))
    op.drop_table("trippackinglist")
