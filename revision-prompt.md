Repair the road junctions of this Sonoma Raceway model. Change nothing else: keep the main circuit (road_main) line, width and elevation, the overall terrain, buildings, grandstands, trees, materials, scale, object names and export settings exactly as they are. Edit only branch-road geometry and the terrain, kerbs and edge lines within about 30 m of each junction listed below.

The attached images show the problem. The first is a measured top-down crop of every junction, with the measured gap and step in each title. The others are viewer screenshots: a branch meeting the main track as a raised slab with a ledge, and a crossing where the main track sits on a walled embankment with the crossing road ending at a cliff and a floating broken piece.

WHAT A CORRECT JUNCTION LOOKS LIKE
- The branch surface meets the road it joins at the same height: no step larger than 2 cm along the whole joint.
- The paving is continuous. Where a branch leaves at an angle, fill the wedge between the diverging edges with a paved gore in the same asphalt, so no grass, gravel or terrain shows between the two roads. No branch end may overhang the other road's shoulder or stick out past its edge into the runoff.
- No coplanar overlapping road surfaces (z-fighting). Either trim the branch exactly along the main road's edge and stitch it there, or keep any overlap at least 3 mm above with matching material.
- Over the last 20-30 m, blend the branch's longitudinal grade and cross-fall smoothly into the road it joins, and regrade the terrain to meet both road shoulders without walls, cliffs or exposed vertical faces.
- Interrupt the main road's white edge line across the branch mouth, and end or taper kerbs cleanly at the mouth.

JUNCTIONS TO FIX (Blender frame: x east, y north, z up; metres)
1. North-west crossing around (-436, 629). road_access_nw ends at (-440.1, 631.3), 2.2-3.0 m above road_main. road_alt_chute ends at (-432.0, 627.3), 2.5-3.7 m below road_main, and road_main runs on a raised, walled embankment here. Make this a flat at-grade crossing: keep road_main at its current elevation, bring both crossing roads to meet it at grade from either side, and regrade the terrain so the embankment walls disappear.
2. Esses junction around (-268, 490). The road_alt_chute end at (-268.7, 489.8) leaves a 1.7 m unpaved wedge. The road_alt_esses_link end at (-268.0, 489.9) is 2.8-3.2 m below road_main. Join both at grade, paving the gore.
3. road_alt_esses_link at (-227.6, 520.6): a 0.1 m step down to road_main.
4. road_alt_t4_t7_outer at (-532.0, 363.3): 3.5-4.9 m above road_main with a 1.3 m wedge (the raised slab in the screenshot). Same road at (-464.2, 579.5): 2.1-2.2 m above road_main. Re-grade this branch so both ends descend smoothly to road_main.
5. Turn 7 cut-through around (-415, 648) to (-368, 618). road_alt_t7_link is a short piece lying on top of road_alt_t7_cut, 2.6 m above it at (-399.2, 637.1), and its other end at (-415.5, 648.2) is 1.6-2.7 m below road_main. The road_alt_t7_cut ends at (-413.0, 648.7) (2.5 m wedge, 0.3-0.7 m above the link) and (-367.9, 618.0) (2.75 m wedge, 0.75-0.8 m below road_main). Make these one clean, continuous cut-through with no stacked or overlapping pieces, joining road_main at grade at both ends.
6. road_alt_t10_inner at (25.5, 380.6): a 2.3 m wedge with steps up to +0.6 m. At (189.8, 198.6): a 2.1 m wedge, 0.3-0.4 m above.
7. road_alt_t11_hairpin at (382.4, -63.5): a 2.0 m wedge, 0.36 m below. At (440.2, -88.8): a 0.6 m wedge with ±0.27 m steps.
8. road_alt_se_chicane at (406.1, -145.8): a 0.7 m wedge, steps to -0.16 m. At (465.4, -171.2): steps from -0.28 to +0.40 m.
9. Pit lane. The road_pit_lane end at (5.3, 134.1) hangs about 5 m off the track edge into the runoff and sits 0.6 m below road_main. The end at (466.2, -127.3) hangs about 6.8 m off the track edge. Make pit entry and exit taper so the pit lane's outer edge converges onto road_main's edge, and merge at grade, with the pit-lane line continuing to the merge point.
10. road_drag_strip at (-72.9, 341.0) overlaps the road_main edge by about 4 m with a 0.4 m ledge. Join it to road_main at grade with a clean trimmed edge, or end it squarely before the track's shoulder with a short grass verge.

Do not alter the other end of the drag strip at (359.4, -0.8) or the far end of road_access_nw at the base edge. Both are intentional dead ends.

Before exporting, inspect every listed junction from a low oblique camera about 30 m away, and fix any remaining step, gap, overhang, wall or flicker. Export the complete model as a single GLB.
