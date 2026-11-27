"""PDF Evidence Report generation with ReportLab."""

from __future__ import annotations

import io
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from backend.app import config
from backend.app.schemas import DerivedMetrics, ResultsPayload

RESPONSIBLE_USE_NOTICE = (
    "RESPONSIBLE USE NOTICE: GeoTerra AI is strictly for protective civic monitoring, disaster early warning, "
    "official field evidence, and resilience planning. No weapons, no targeting, and no tracking of individual "
    "people or vehicles. All metrics are area-level. Karnataka flood predictions are unvalidated model outputs, "
    "and land-change alerts require official verification."
)


def _table_style(header_bg: colors.Color = colors.HexColor("#0f172a")) -> TableStyle:
    return TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), header_bg),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]
    )


def _add_footer(canvas, doc) -> None:
    canvas.saveState()
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(colors.HexColor("#475569"))
    canvas.drawString(1.5 * cm, 1.0 * cm, "GeoTerra AI — Protective Civic Monitoring Only | Official Verification Required")
    canvas.drawRightString(A4[0] - 1.5 * cm, 1.0 * cm, f"Page {doc.page}")
    canvas.restoreState()


def _resolve_local_image(url_path: str) -> Path | None:
    """Resolve an /api/images/... relative URL to an existing file in backend/data/images."""
    prefix = "/api/images/"
    if url_path.startswith(prefix):
        rel = url_path[len(prefix) :].lstrip("/")
        p = config.IMAGES_DIR / rel
        if p.exists():
            return p
    return None


def build_evidence_report_pdf(
    results: ResultsPayload,
    derived: DerivedMetrics,
    ai_summary: Dict[str, Any],
    model_card: Dict[str, Any] | None = None,
    engine_data: Dict[str, Any] | None = None,
    missions_data: Dict[str, Any] | None = None,
    mission_id: str | None = None,
) -> bytes:
    """Render a multi-section Evidence Report PDF to bytes."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=1.5 * cm,
        rightMargin=1.5 * cm,
        topMargin=1.5 * cm,
        bottomMargin=1.8 * cm,
        title="GeoTerra AI Evidence Report",
    )

    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("H1", parent=styles["Heading1"], fontSize=16, textColor=colors.HexColor("#0f172a"), spaceAfter=4)
    h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=11.5, textColor=colors.HexColor("#1e3a8a"), spaceBefore=10, spaceAfter=4)
    body = ParagraphStyle("Body", parent=styles["Normal"], fontSize=9, leading=12.5, textColor=colors.HexColor("#1e293b"))
    warn = ParagraphStyle("Warn", parent=styles["Normal"], fontSize=8.5, leading=11.5, textColor=colors.HexColor("#92400e"), backColor=colors.HexColor("#fef3c7"), borderPadding=5)
    notice = ParagraphStyle("Notice", parent=styles["Normal"], fontSize=8, leading=11, textColor=colors.HexColor("#0f172a"), backColor=colors.HexColor("#e2e8f0"), borderPadding=6)

    story: List[Any] = []
    story.append(Paragraph("GeoTerra AI — Satellite Flood & Land-Change Evidence Report", h1))
    story.append(
        Paragraph(
            f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} | "
            f"Pipeline Output Timestamp: {results.generated_at}",
            body,
        )
    )
    if results.sample:
        story.append(Spacer(1, 4))
        story.append(Paragraph("<b>SAMPLE DATA NOTICE:</b> This report was generated from synthetic sample data for demonstration. Replace backend/data with real pipeline exports for operational briefings.", warn))

    story.append(Paragraph("1. Data Sources & Acquisition Dates", h2))
    src_rows = [
        ["Module", "Collection / Source", "Before", "After", "Validation Status"],
        [
            "Flood Extent",
            "Sentinel-1 RTC (Planetary Computer)",
            f"{results.flood.date_before} ({results.flood.scene_before[:22]})",
            f"{results.flood.date_after} ({results.flood.scene_after[:22]})",
            "Validated" if results.flood.validated else "Model prediction (unvalidated)",
        ],
        [
            "Land Change",
            "Sentinel-2 L2A (NDVI drop + BSI)",
            results.change.dates.before,
            results.change.dates.after,
            "Requires official verification",
        ],
    ]
    t_src = Table(src_rows, colWidths=[2.6 * cm, 4.3 * cm, 3.8 * cm, 3.8 * cm, 3.5 * cm])
    t_src.setStyle(_table_style())
    story.append(t_src)

    story.append(Paragraph("2. Flood Impact & Land-Change Metrics (EPSG:32643 UTM-43N)", h2))
    metrics_rows = [
        ["Metric", "Value", "Notes / Labeling"],
        ["AOI", results.flood.aoi_name, "Model prediction (unvalidated)" if not results.flood.validated else "Validated"],
        ["Predicted Flooded Area", f"{results.flood.flooded_area_ha:.2f} ha", "JRC permanent water excluded"],
        ["Cropland Affected (ESA WorldCover)", f"{results.flood.cropland_affected_ha:.2f} ha", "Area-level intersection"],
        ["Built-Up Affected (ESA WorldCover)", f"{results.flood.built_up_affected_ha:.2f} ha", "Area-level intersection"],
        ["Roads Affected (OSM)", f"{results.flood.roads_affected_km:.2f} km", "Driveway network overlap"],
        ["Flagged Land-Change Area", f"{results.change.changed_area_ha:.2f} ha", f"{len(results.change.polygons)} polygons — Potential suspicious activity: requires official verification"],
    ]
    t_m = Table(metrics_rows, colWidths=[5.5 * cm, 3.8 * cm, 8.7 * cm])
    t_m.setStyle(_table_style())
    story.append(t_m)

    # Before / After Satellite Previews
    img_pairs = [
        ("s1_before.png", "s1_after.png", "Sentinel-1 SAR Before", "Sentinel-1 SAR After"),
        ("s2_before.png", "s2_after.png", "Sentinel-2 Before", "Sentinel-2 After"),
    ]
    avail_imgs = []
    for b_name, a_name, b_cap, a_cap in img_pairs:
        bp, ap = config.IMAGES_DIR / b_name, config.IMAGES_DIR / a_name
        if bp.exists() and ap.exists():
            avail_imgs.append(([Image(str(bp), width=7.8 * cm, height=5.2 * cm), Image(str(ap), width=7.8 * cm, height=5.2 * cm)], [b_cap, a_cap]))

    if avail_imgs:
        story.append(Paragraph("3. Before & After Satellite Previews", h2))
        for imgs, caps in avail_imgs:
            img_tbl = Table([imgs, caps], colWidths=[8.8 * cm, 8.8 * cm])
            img_tbl.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"), ("FONTSIZE", (0, 1), (-1, 1), 8)]))
            story.append(img_tbl)
            story.append(Spacer(1, 6))

    story.append(Paragraph("4. Model Evaluation Metrics (Labeled Splits Only)", h2))
    story.append(
        Paragraph(
            f"<b>Model:</b> {results.model.name} trained on {results.model.trained_on}. "
            "<b>Important:</b> IoU/F1 metrics below apply strictly to labeled Sen1Floods11 splits; "
            "Karnataka predictions have NO ground-truth labels and are marked <b>Model prediction (unvalidated)</b>.",
            body,
        )
    )
    model_rows = [
        ["Split", "U-Net IoU", "U-Net F1", "VH Baseline IoU", "VH Baseline F1"],
        ["Validation (Sen1Floods11)", f"{results.model.metrics.val.iou:.3f}", f"{results.model.metrics.val.f1:.3f}", "-", "-"],
        ["Test (Sen1Floods11)", f"{results.model.metrics.test.iou:.3f}", f"{results.model.metrics.test.f1:.3f}", f"{results.model.baseline_metrics.test.iou:.3f}", f"{results.model.baseline_metrics.test.f1:.3f}"],
        ["Held-out Bolivia Event", f"{results.model.metrics.bolivia.iou:.3f}", f"{results.model.metrics.bolivia.f1:.3f}", f"{results.model.baseline_metrics.bolivia.iou:.3f}", f"{results.model.baseline_metrics.bolivia.f1:.3f}"],
        ["Karnataka AOI", "Unvalidated", "Unvalidated", "N/A", "N/A"],
    ]
    t_mod = Table(model_rows, colWidths=[5.2 * cm, 3.2 * cm, 3.2 * cm, 3.2 * cm, 3.2 * cm])
    t_mod.setStyle(_table_style())
    story.append(t_mod)

    story.append(Paragraph("5. Economic Exposure & Operational Assumptions", h2))
    econ_rows = [
        ["Parameter", "Value", "Tag"],
        ["Assumed Cropland Loss per Hectare", f"INR {results.economics.loss_per_ha_inr:,.0f} / ha", "Assumption"],
        ["Estimated Cropland Loss", f"INR {derived.estimated_cropland_loss_inr:,.0f}", "Derived (cropland_ha x loss_per_ha)"],
        ["Manual Assessment Time", f"{results.economics.assessment_time_manual_days:.1f} days ({derived.manual_assessment_hours:.0f} hrs)", "Assumption"],
        ["GeoTerra AI Assessment Time", f"{results.economics.assessment_time_geoterra_hours:.1f} hours", "Assumption"],
    ]
    t_ec = Table(econ_rows, colWidths=[6.5 * cm, 6.0 * cm, 5.5 * cm])
    t_ec.setStyle(_table_style())
    story.append(t_ec)

    story.append(Paragraph(f"6. AI-Assisted Advisory ({ai_summary.get('ai_tag', 'AI-assisted, requires official verification')})", h2))
    safe_ai = str(ai_summary.get("text", "")).replace("\n", "<br/>")
    story.append(Paragraph(safe_ai, body))

    story.append(Paragraph("7. Priority Official Field Verification Locations", h2))
    loc_rows = [["ID / Location", "Type", "Area / Pop", "Near River / Priority", "Required Status"]]
    for s in results.flood.settlements_affected[:6]:
        loc_rows.append([s.name, "Flood Settlement", f"Est. pop {s.population_estimate or 'N/A'}", f"Priority: {s.priority.upper()}", "Model prediction (unvalidated)"])
    for p in results.change.polygons[:6]:
        loc_rows.append([p.id, "Land Change", f"{p.area_ha:.2f} ha (conf {p.confidence:.2f})", "Near river" if p.near_river else "Inland", p.status])
    t_loc = Table(loc_rows, colWidths=[3.4 * cm, 2.7 * cm, 3.3 * cm, 3.1 * cm, 5.5 * cm])
    t_loc.setStyle(_table_style())
    story.append(t_loc)

    if engine_data:
        story.append(Paragraph("8. Bengaluru Monitoring Sites & 4-Module AI Prediction Summary", h2))
        story.append(
            Paragraph(
                "Note: All future horizon projections and unvalidated flood/growth/heat/lake screens are analytical estimates — not guaranteed outcomes.",
                body,
            )
        )
        site_rows = [["Location", "Focus", "Risk", "Detected Satellite Summary"]]
        for loc in engine_data.get("focus_locations", [])[:6]:
            site_rows.append(
                [
                    Paragraph(str(loc.get("name", "")), body),
                    Paragraph(str(loc.get("focus", "")), body),
                    f"{loc.get('risk_level', '')} ({loc.get('risk_score', 0):.0f})",
                    Paragraph(str(loc.get("detected_changes", ""))[:150], body),
                ]
            )
        t_sites = Table(site_rows, colWidths=[3.8 * cm, 4.2 * cm, 2.5 * cm, 7.5 * cm])
        t_sites.setStyle(_table_style())
        story.append(t_sites)
        story.append(Spacer(1, 6))

        mod_rows = [["Prediction Module", "Risk (H/M/L)", "Current Condition", "Future Projection (Estimate)"]]
        for _, m in engine_data.get("modules", {}).items():
            rb = m.get("risk_breakdown", {})
            mod_rows.append(
                [
                    Paragraph(str(m.get("name", "")), body),
                    f"{rb.get('high', 0)}/{rb.get('medium', 0)}/{rb.get('low', 0)}",
                    Paragraph(str(m.get("current_condition", ""))[:130], body),
                    Paragraph(str(m.get("future_prediction", ""))[:130], body),
                ]
            )
        t_mods = Table(mod_rows, colWidths=[3.3 * cm, 2.3 * cm, 6.2 * cm, 6.2 * cm])
        t_mods.setStyle(_table_style())
        story.append(t_mods)

    if missions_data and missions_data.get("missions"):
        missions = missions_data["missions"]
        mission = next((m for m in missions if m.get("id") == mission_id), missions[0])
        findings = mission.get("drone_findings", {})
        story.append(Paragraph("9. Simulated Satellite -> HAPS -> Drone Emergency Inspection Evidence", h2))
        story.append(
            Paragraph(
                "<b>DIGITAL TWIN SIMULATION NOTICE:</b> Operations below simulate orbital tasking, 20 km HAPS relay, "
                "and autonomous drone inspection over real satellite hazards. No real satellites, HAPS or drones are controlled.",
                warn,
            )
        )
        story.append(Spacer(1, 4))
        m_rows = [
            ["Field", "Details"],
            ["Mission / Alert", f"{mission.get('auto_alert', {}).get('alert_id', '')} — {mission.get('title', '')} ({mission.get('severity', '')})"],
            ["Trigger Source", str(mission.get("trigger_source", ""))],
            ["HAPS Relay & UAV Route", f"{mission.get('haps_station', {}).get('name', '')} (20 km) -> UAV {findings.get('distance_km', 0)} km ({findings.get('flight_duration_min', 0)} min)"],
            ["Immediate Attention Sites", "; ".join(findings.get("immediate_attention_areas", []))],
            ["Recommended Response Actions", "; ".join(findings.get("recommended_actions", []))],
        ]
        t_mis = Table(m_rows, colWidths=[4.2 * cm, 13.8 * cm])
        t_mis.setStyle(_table_style())
        story.append(t_mis)

        sim_imgs = []
        sim_caps = []
        for cap in mission.get("simulated_captures", [])[:2]:
            p = _resolve_local_image(cap.get("image_url", ""))
            if p:
                sim_imgs.append(Image(str(p), width=7.5 * cm, height=5.0 * cm))
                sim_caps.append(Paragraph(f"SIMULATED DRONE CAPTURE: {cap.get('label', '')}", body))
        if sim_imgs:
            story.append(Spacer(1, 6))
            cols = [8.8 * cm] * len(sim_imgs)
            tbl_sim = Table([sim_imgs, sim_caps], colWidths=cols)
            tbl_sim.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER")]))
            story.append(tbl_sim)

    story.append(Spacer(1, 10))
    story.append(Paragraph(RESPONSIBLE_USE_NOTICE, notice))

    doc.build(story, onFirstPage=_add_footer, onLaterPages=_add_footer)
    return buf.getvalue()
