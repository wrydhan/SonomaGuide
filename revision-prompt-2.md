Revise this Sonoma Raceway model. Coordinates are in Blender's frame: metres, x east, y north, z up. Keep road_main exactly as it is (line, width, heights, its kerbs and edge lines), and leave buildings, grandstands, materials, UVs, scale and object names unchanged. Edit only the branch roads, their own kerbs and markings, and the terrain, barriers and trees within 30 m of them.

Images: 1 is a map of junctions J1-J16. Images 2 and 3 show BEFORE and AFTER for each junction. AFTER is the target: it was made by hand-editing this model's export, so reproduce it. Image 4 shows remaining issues A-D that are still visible in that AFTER version; fix them too.

HOW TO JOIN A BRANCH (apply at every Jn)
1. Move the branch's end vertices onto road_main. Where the branch overlaps road_main, keep it 3 cm below road_main's surface (10 cm for road_pit_lane and road_drag_strip), so road_main's asphalt and white edge line run unbroken across the mouth.
2. Branch top-surface vertices within 4 m outside road_main's edge sit exactly at road_main's edge height. For the pit lane and drag strip, sit them 2 cm below that edge, held for 2.5 m and easing out by 6 m.
3. Slide any end corner that stops short onto road_main, 0.5 m past its edge. Taper that slide back along the branch over max(25 m, 4 x the slide).
4. Height blend: add D x (1 - smoothstep(0, L, s)). Here s is the distance along the branch surface from its end, D is the change needed at that point (vary it across the width so the cross-fall matches road_main), and L = max(25 m, |D| / 0.08). Move each road's sloped sides together with its top edge.
5. Terrain: under a moved branch, 12 cm below its surface. Under its sloped sides, raise the ground to 4 cm below the road edge so no grey side face shows. Ease back to the existing ground over 24 m. Ground within 2 m of any road edge must never stand above that edge. Do not move ground within 1.5 m of road_main's edge.
6. A branch's kerbs move with it and stay on its edge, without twisting. Guardrails, walls, tyre stacks and trees re-ground on the new terrain and stay straight.

TARGETS (end centre x, y -> road_main surface z there; change needed; blend length L; corner slide)
J1 crossing: road_access_nw end (-440.1, 631.3) -> z 49.70: lower 2.2-3.0 m, L 38 m. road_alt_chute end (-432.0, 627.3) -> z 49.96: raise 2.4-3.7 m, L 46 m. Result: a flat, at-grade crossing with no embankment walls.
J2: road_alt_chute end (-268.7, 489.8) -> z 44.07: -0.10 to -0.16 m; close its 1.7 m wedge (slide 2.2 m). road_alt_esses_link end (-268.0, 489.9) -> z 44.03: raise 2.8-3.2 m, L 40 m, slide 0.7 m. The two branch ends must not overlap each other.
J3: road_alt_esses_link (-227.6, 520.6) -> z 41.03: -0.02 to +0.09 m.
J4: road_alt_se_chicane (406.1, -145.8) -> z 20.15: -0.04 to +0.17 m, slide 1.2 m.
J5: road_alt_se_chicane (465.4, -171.2) -> z 19.72: cross-fall -0.43 to +0.25 m.
J6: road_alt_t10_inner (25.5, 380.6) -> z 31.20: -0.65 to +0.37 m, slide 2.8 m.
J7: road_alt_t10_inner (189.8, 198.6) -> z 23.63: -0.51 to -0.35 m, slide 2.6 m.
J8: road_alt_t11_hairpin (382.4, -63.5) -> z 20.26: -0.09 to +0.43 m, slide 2.5 m.
J9: road_alt_t11_hairpin (440.2, -88.8) -> z 20.14: -0.29 to +0.40 m, slide 1.1 m.
J10: road_alt_t4_t7_outer (-532.0, 363.3) -> z 57.01: lower 3.2-4.9 m, L 61 m, slide 1.8 m.
J11: road_alt_t4_t7_outer (-464.2, 579.5) -> z 47.00: lower 2.1-2.2 m, L 28 m.
J12: delete road_alt_t7_link (a stacked duplicate). road_alt_t7_cut end (-413.0, 648.7) -> z 55.41: raise 0.5-2.6 m, L 32 m.
J13: road_alt_t7_cut (-367.9, 618.0) -> z 47.17: raise 0.7-0.8 m, slide 3.3 m.
J14: road_drag_strip end (-72.9, 341.0) -> z 29.90: -0.42 to +0.10 m, no slide. Tuck its whole overlap with road_main 10 cm under it.
J15: road_pit_lane (5.3, 134.1) -> z 32.27: raise 0.54-0.68 m. Slide its outer edge 5.5 m onto road_main over a 25 m taper.
J16: road_pit_lane (466.2, -127.3) -> z 20.12: raise 0.06-0.12 m. Slide its outer edge 7.3 m over a 29 m taper.
Leave these as dead ends: road_drag_strip at (359.4, -0.8), and road_access_nw at the base edge.

ALSO FIX (image 4)
A. road_access_nw: rebuild it as a clean 7 m-wide ribbon along its current centreline, from the base edge to J1. Edges straight and parallel, with no notches, sawtooth or torn corners. Bury its sides in the terrain, and meet road_main flush with no lip.
B. Every branch road: no grey sloped side face showing above the ground, and no sawtooth where the terrain meets it. Terrain within 3 m of the edge rises to 4 cm below the edge (outside road_main's 1.5 m keep zone).
C. Pit-lane tapers at J15 and J16: grade the ground beside each taper no steeper than 1:3, in the normal sand material, with no grey-blue patch. The pit-lane line continues to the merge point, with no notches where the pit lane meets road_main.
D. Drag strip: delete the part of bar_guardrail_R_10 that crosses it between (-41.9, 325.3) and (-34.7, 302.3), and keep the rest of that rail straight. The centre line (trackside_drag_centreline) stops 0.5 m before road_main. The end corner on the verge sits at ground level, not as a raised slab.
E. Short branches (road_alt_esses_link, road_alt_t7_cut): smooth vertical curves, with no crease where a blend starts.
F. At every mouth, road_main's kerbs end in clean square ends, with no overlapping kerb pieces.

CHECK AND EXPORT
- Work in this order: J10, J11, J1, J2, J12, J13, then J3-J9, then J14-J16, then A-F. Export the complete GLB after each group, so the work is kept even if you stop early. The final GLB must differ from the input.
- After each junction, cast rays straight down through the branch's end vertices. Every one must hit road_main 0-3 cm below its surface (0-10 cm for the pit lane and drag strip). Check that no terrain vertex within 2 m of a road edge stands above that edge.
- Before each export, inspect every Jn from a 30 m oblique camera on both sides.
