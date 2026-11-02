using System.Text.Json;
using Autodesk.Revit.ApplicationServices;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Autodesk.Revit.UI.Events;

namespace DemoBuild;

/// <summary>
/// Builds the DEMO project from the plan the app exports (demo.json, see client/src/lib/revitExport.js):
///   new project from the German architecture template -> two levels -> wall types of 36.5 and 11.5 cm (the walls of the technical plan) -> the walls of the storey
///   below, the knee walls and gables of the attic, the partition walls of the layout (profile walls that follow the roof) -> floors (stair opening cut out) -> a roof
///   of the template's own roof type (pitch and knee wall of the app, with eaves) -> openings for doors and windows -> views: floor plan with the cut walls filled
///   black, three 3D views (outside, roof off, section) -> saves DEMO.rvt -> reopens it and exports the views as pictures.
/// Every step has its own transaction and is logged to demo_log.txt, so a step that fails does not take the others with it. It runs once, when Revit is idle after
/// the start (so there is a UI document to export from). Nothing here has been run by the author: read demo_log.txt first.
/// </summary>
public class App : IExternalApplication
{
    static readonly string Dir = Environment.GetEnvironmentVariable("DEMO_DIR") ?? Path.Combine(Path.GetTempPath(), "usable-space-demo");
    const string DefaultTemplate = @"C:\ProgramData\Autodesk\RVT 2025\Templates\German\BIM_Architektur_und_Ingenieurbau.rte";
    const double DoorH = 2.05, Sill = 0.9;
    static readonly List<string> Lines = new();
    static UIControlledApplication? Ctl;
    static bool started;

    static void L(string s)
    {
        Lines.Add($"{DateTime.Now:HH:mm:ss}  {s}");
        try { File.WriteAllLines(Path.Combine(Dir, "demo_log.txt"), Lines); } catch { /* the log is a convenience */ }
    }

    public Result OnStartup(UIControlledApplication a) { Ctl = a; a.Idling += OnIdling; return Result.Succeeded; }
    public Result OnShutdown(UIControlledApplication a) => Result.Succeeded;

    static void OnIdling(object? sender, IdlingEventArgs e)
    {
        if (started) return;
        started = true;
        if (Ctl != null) Ctl.Idling -= OnIdling;
        try
        {
            Directory.CreateDirectory(Dir);
            Run((UIApplication)sender!);
            File.WriteAllText(Path.Combine(Dir, "done.txt"), "ok");
        }
        catch (Exception ex)
        {
            L("FAILED: " + ex);
            try { File.WriteAllText(Path.Combine(Dir, "error.txt"), ex.ToString()); } catch { }
        }
    }

    // ------------------------------------------------------------------------------------------------------ numbers and coordinates
    static double Ft(double m) => UnitUtils.ConvertToInternalUnits(m, UnitTypeId.Meters);
    /// <summary>plan x right, plan y down (metres)  ->  Revit x right, y up (feet)</summary>
    static XYZ P(double x, double y, double z) => new(Ft(x), Ft(-y), Ft(z));
    static double Num(JsonElement e, string k, double d = 0) => e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDouble() : d;

    sealed class Geo
    {
        public double W, D, Knee, Pitch, MaxH, Storey, TOut, TIn;
        public double Tan => Math.Tan(Pitch * Math.PI / 180);
        /// <summary>height of the inner roof surface over x (a gable roof, ridge along y), capped at the height limit</summary>
        public double H(double x) => Math.Min(MaxH, Knee + Tan * Math.Min(x, W - x));
        /// <summary>the x where the height limit cuts the slope (or null when the ridge stays below it)</summary>
        public double? Cap => Tan > 1e-6 && Knee + Tan * (W / 2) > MaxH ? (MaxH - Knee) / Tan : null;
    }

    /// <summary>a warning (overlapping walls, a join that did not work) would open a dialog and hold the run: they are dropped and logged, errors still fail the step</summary>
    sealed class Quiet : IFailuresPreprocessor
    {
        public FailureProcessingResult PreprocessFailures(FailuresAccessor fa)
        {
            foreach (var m in fa.GetFailureMessages())
                if (m.GetSeverity() == FailureSeverity.Warning) { L("        warning: " + m.GetDescriptionText()); fa.DeleteWarning(m); }
            return FailureProcessingResult.Continue;
        }
    }

    static void Step(Document doc, string what, Action act)
    {
        using var t = new Transaction(doc, what);
        try
        {
            t.Start();
            var fo = t.GetFailureHandlingOptions(); fo.SetFailuresPreprocessor(new Quiet()); t.SetFailureHandlingOptions(fo);
            act(); t.Commit(); L("ok      " + what);
        }
        catch (Exception ex)
        {
            if (t.GetStatus() == TransactionStatus.Started) t.RollBack();
            L($"FAILED  {what}: {ex.Message}");
        }
    }

    // ------------------------------------------------------------------------------------------------------ the build
    static void Run(UIApplication uiapp)
    {
        var root = JsonDocument.Parse(File.ReadAllText(Path.Combine(Dir, "demo.json"))).RootElement;
        var r = root.GetProperty("room");
        var walls = root.GetProperty("walls");
        var g = new Geo { W = Num(r, "width"), D = Num(r, "depth"), Knee = Num(r, "kneeWall"), Pitch = Num(r, "pitch"), MaxH = Num(r, "maxHeight", 9), Storey = Num(root, "storey", 3), TOut = Num(walls, "outer", 0.365), TIn = Num(walls, "inner", 0.115) };
        var template = root.TryGetProperty("template", out var tp) && tp.ValueKind == JsonValueKind.String ? tp.GetString()! : DefaultTemplate;
        var name = root.TryGetProperty("name", out var nm) && nm.ValueKind == JsonValueKind.String ? nm.GetString()! : "DEMO";
        var app = uiapp.Application;
        var doc = app.NewProjectDocument(template);
        L($"project from {Path.GetFileName(template)} in {app.VersionName}; room {g.W} x {g.D} m, knee wall {g.Knee} m, pitch {g.Pitch} deg, storey {g.Storey} m");

        Level? lvEg = null, lvDg = null;
        Step(doc, "levels", () =>
        {
            lvEg = Level.Create(doc, 0);
            lvDg = Level.Create(doc, Ft(g.Storey));
            try { lvEg.Name = "US EG"; lvDg.Name = "US DG"; } catch { /* the template may have levels of those names */ }
        });
        if (lvEg == null || lvDg == null) throw new InvalidOperationException("no levels: nothing can be built");

        WallType? wOut = null, wIn = null;
        Step(doc, $"wall types {g.TOut * 100:0.#} and {g.TIn * 100:0.#} cm", () => { wOut = MakeWallType(doc, "US Aussenwand " + (g.TOut * 1000).ToString("0"), g.TOut); wIn = MakeWallType(doc, "US Innenwand " + (g.TIn * 1000).ToString("0"), g.TIn); });
        if (wOut == null || wIn == null) throw new InvalidOperationException("no wall types");

        var c = g.TOut / 2;   // the centre line of an outer wall lies half a wall outside the room
        var lower = new List<Wall>();   // N, E, S, W
        Step(doc, "outer walls of the storey below", () =>
        {
            var pts = new[] { (-c, -c), (g.W + c, -c), (g.W + c, g.D + c), (-c, g.D + c) };
            for (int i = 0; i < 4; i++)
            {
                var (ax, ay) = pts[i]; var (bx, by) = pts[(i + 1) % 4];
                lower.Add(Wall.Create(doc, Line.CreateBound(P(ax, ay, 0), P(bx, by, 0)), wOut!.Id, lvEg!.Id, Ft(g.Storey), 0, false, false));
            }
        });

        Wall? gableN = null, gableS = null;
        Step(doc, "attic: knee walls and gables", () =>
        {
            foreach (var x in new[] { -c, g.W + c })
                Wall.Create(doc, Line.CreateBound(P(x, -c, g.Storey), P(x, g.D + c, g.Storey)), wOut!.Id, lvDg!.Id, Ft(Math.Max(0.3, g.Knee)), 0, false, false);
            gableN = ProfileWall(doc, GableOutline(g, -c), wOut!, lvDg!);
            gableS = ProfileWall(doc, GableOutline(g, g.D + c), wOut!, lvDg!);
        });

        var partitions = new List<(Wall wall, double len, double x0, double y0, double ux, double uy, JsonElement ops)>();
        Step(doc, "partition walls of the technical plan", () =>
        {
            foreach (var p in root.GetProperty("partitions").EnumerateArray())
            {
                var p0 = p.GetProperty("p0"); var p1 = p.GetProperty("p1");
                double x0 = p0[0].GetDouble(), y0 = p0[1].GetDouble(), x1 = p1[0].GetDouble(), y1 = p1[1].GetDouble(), len = Math.Sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
                if (len < 0.2) continue;
                var w = ProfileWall(doc, PartitionOutline(g, x0, y0, x1, y1), wIn!, lvDg!);
                partitions.Add((w, len, x0, y0, (x1 - x0) / len, (y1 - y0) / len, p.GetProperty("op")));
            }
        });

        Step(doc, "floors (the stair opening cut out)", () =>
        {
            var ft = new FilteredElementCollector(doc).OfClass(typeof(FloorType)).Cast<FloorType>().ToList();
            var type = ft.FirstOrDefault(t => !t.IsFoundationSlab) ?? ft.First();
            Slab(doc, type, lvEg!, -c, -c, g.W + c, g.D + c, null);
            double[]? st = root.GetProperty("room").TryGetProperty("stair", out var s) && s.ValueKind == JsonValueKind.Array ? s.EnumerateArray().Select(v => v.GetDouble()).ToArray() : null;
            Slab(doc, type, lvDg!, -c, -c, g.W + c, g.D + c, st);
        });

        Step(doc, "roof of the template (pitch and knee wall of the app, with eaves)", () =>
        {
            var types = new FilteredElementCollector(doc).OfClass(typeof(RoofType)).Cast<RoofType>().OrderBy(t => t.Name).ToList();
            var rt = types.FirstOrDefault(t => t.Name.Contains("Ziegel", StringComparison.OrdinalIgnoreCase)) ?? types.FirstOrDefault(t => t.Name.Contains("Dach", StringComparison.OrdinalIgnoreCase)) ?? types.First();
            L($"        roof type: {rt.FamilyName} : {rt.Name} ({types.Count} roof types in the template)");
            double ox = 0.5 + c, oy = 0.3 + c;   // eaves 50 cm, verge 30 cm outside the walls
            var fp = new CurveArray();
            fp.Append(Line.CreateBound(P(-ox, -oy, 0), P(g.W + ox, -oy, 0)));
            fp.Append(Line.CreateBound(P(g.W + ox, -oy, 0), P(g.W + ox, g.D + oy, 0)));
            fp.Append(Line.CreateBound(P(g.W + ox, g.D + oy, 0), P(-ox, g.D + oy, 0)));
            fp.Append(Line.CreateBound(P(-ox, g.D + oy, 0), P(-ox, -oy, 0)));
            var roof = doc.Create.NewFootPrintRoof(fp, lvDg!, rt, out ModelCurveArray map);
            for (int i = 0; i < map.Size; i++)
            {
                bool eave = i == 1 || i == 3;   // the two long sides (x constant) carry the slope
                roof.set_DefinesSlope(map.get_Item(i), eave);
                if (eave) roof.set_SlopeAngle(map.get_Item(i), g.Tan);
            }
            // the roof's plane runs through the top of the knee wall, so its edge 0.5 m further out lies lower by tan(pitch) * 0.5
            roof.get_Parameter(BuiltInParameter.ROOF_LEVEL_OFFSET_PARAM)?.Set(Ft(g.Knee - g.Tan * (0.5 + c)));
            if (g.Cap is double) L($"        note: the app caps the roof at {g.MaxH} m; the Revit roof keeps the slope up to the ridge ({g.Knee + g.Tan * g.W / 2:0.00} m)");
        });

        Step(doc, "openings: doors of the partitions, windows of the facade", () =>
        {
            doc.Regenerate();
            foreach (var (wall, len, x0, y0, ux, uy, ops) in partitions)
                foreach (var o in ops.EnumerateArray())
                {
                    double a = Math.Max(0, o[0].GetDouble()), b = Math.Min(len, o[1].GetDouble());
                    if (b - a < 0.4) continue;
                    doc.Create.NewOpening(wall, P(x0 + ux * a, y0 + uy * a, g.Storey), P(x0 + ux * b, y0 + uy * b, g.Storey + DoorH));
                }
            foreach (var w in r.TryGetProperty("windows", out var ws) && ws.ValueKind == JsonValueKind.Array ? ws.EnumerateArray() : Enumerable.Empty<JsonElement>())
            {
                var side = w.GetProperty("wall").GetString(); double pos = Num(w, "pos"), wd = Num(w, "width", 1.2);
                if (side != "N" && side != "S") continue;   // the app draws only the gable windows
                var host = side == "N" ? gableN : gableS; double y = side == "N" ? -c : g.D + c;
                if (host == null) continue;
                double top = Math.Min(2.1, g.H(pos) - 0.1);
                if (top - Sill < 0.3) continue;
                doc.Create.NewOpening(host, P(pos - wd / 2, y, g.Storey + Sill), P(pos + wd / 2, y, g.Storey + top));
            }
            if (lower.Count == 4)
                foreach (var k in new[] { 0.28, 0.72 })
                    foreach (var (wall, y) in new[] { (lower[0], -c), (lower[2], g.D + c) })
                        doc.Create.NewOpening(wall, P(g.W * k - 0.55, y, 0.95), P(g.W * k + 0.55, y, 2.25));
        });

        Step(doc, "views: plan with black cut walls, 3D outside, roof off, section", () => MakeViews(doc, g, lvDg!));

        var path = Path.Combine(Dir, name + ".rvt");
        doc.SaveAs(path, new SaveAsOptions { OverwriteExistingFile = true });
        L("saved " + path);
        doc.Close(false);

        var uidoc = uiapp.OpenAndActivateDocument(path);
        foreach (var (view, file) in new[] { ("US 3D Aussen", "revit_exterior"), ("US 3D Schnitt", "revit_section"), ("US 3D Dach ab", "revit_cutaway"), ("US Grundriss DG", "revit_plan") })
        {
            var v = new FilteredElementCollector(uidoc.Document).OfClass(typeof(View)).Cast<View>().FirstOrDefault(x => x.Name == view);
            if (v == null) { L($"FAILED  no view {view}"); continue; }
            ExportView(uidoc, v, file);
        }
        try
        {
            var docs = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "Usable Space");
            Directory.CreateDirectory(docs);
            File.Copy(path, Path.Combine(docs, name + ".rvt"), true);
            L("copy in " + docs);
        }
        catch (Exception ex) { L("no copy in Documents: " + ex.Message); }
    }

    // ------------------------------------------------------------------------------------------------------ pieces
    static WallType MakeWallType(Document doc, string name, double widthM)
    {
        var basics = new FilteredElementCollector(doc).OfClass(typeof(WallType)).Cast<WallType>().Where(w => w.Kind == WallKind.Basic).ToList();
        var have = basics.FirstOrDefault(w => w.Name == name);
        if (have != null) return have;
        var src = basics.First();
        var mat = src.GetCompoundStructure()?.GetLayers().Select(l => l.MaterialId).FirstOrDefault(id => id != ElementId.InvalidElementId) ?? ElementId.InvalidElementId;
        var wt = (WallType)src.Duplicate(name);
        wt.SetCompoundStructure(CompoundStructure.CreateSingleLayerCompoundStructure(MaterialFunctionAssignment.Structure, Ft(widthM), mat));
        return wt;
    }

    /// <summary>a wall whose outline is a closed polygon in one vertical plane</summary>
    static Wall ProfileWall(Document doc, IList<XYZ> pts, WallType type, Level level)
    {
        var curves = new List<Curve>();
        for (int i = 0; i < pts.Count; i++)
        {
            var a = pts[i]; var b = pts[(i + 1) % pts.Count];
            if (a.DistanceTo(b) > 1e-4) curves.Add(Line.CreateBound(a, b));
        }
        return Wall.Create(doc, curves, type.Id, level.Id, false);
    }

    /// <summary>the gable wall at plan y: from the floor of the attic up to the roof (ridge, or flat top where the height limit cuts it)</summary>
    static List<XYZ> GableOutline(Geo g, double y)
    {
        var c = g.TOut / 2; double z0 = g.Storey;
        var pts = new List<XYZ> { P(-c, y, z0), P(g.W + c, y, z0), P(g.W + c, y, z0 + Math.Max(0.1, g.H(g.W + c))) };
        if (g.Cap is double xc) { pts.Add(P(g.W - xc, y, z0 + g.MaxH)); pts.Add(P(xc, y, z0 + g.MaxH)); }
        else pts.Add(P(g.W / 2, y, z0 + g.H(g.W / 2)));
        pts.Add(P(-c, y, z0 + Math.Max(0.1, g.H(-c))));
        return pts;
    }

    /// <summary>a partition wall follows the roof: bottom edge at the floor of the attic, top edge at the roof height along the wall</summary>
    static List<XYZ> PartitionOutline(Geo g, double x0, double y0, double x1, double y1)
    {
        double z0 = g.Storey;
        var pts = new List<XYZ> { P(x0, y0, z0), P(x1, y1, z0) };
        if (Math.Abs(y1 - y0) < 1e-6)   // along x: the height changes along the wall
        {
            var xs = new List<double> { x0, x1 };
            foreach (var k in new double?[] { g.W / 2, g.Cap, g.Cap is double q ? g.W - q : null }) if (k is double v && v > Math.Min(x0, x1) + 0.05 && v < Math.Max(x0, x1) - 0.05) xs.Add(v);
            foreach (var x in xs.OrderByDescending(v => x1 >= x0 ? v : -v)) pts.Add(P(x, y0, z0 + Math.Max(0.3, g.H(x))));
        }
        else { double h = Math.Max(0.3, g.H(x0)); pts.Add(P(x1, y1, z0 + h)); pts.Add(P(x0, y0, z0 + h)); }
        return pts;
    }

    static void Slab(Document doc, FloorType type, Level level, double x0, double y0, double x1, double y1, double[]? hole)
    {
        CurveLoop Loop(double a, double b, double c2, double d) { var l = new CurveLoop(); l.Append(Line.CreateBound(P(a, b, 0), P(c2, b, 0))); l.Append(Line.CreateBound(P(c2, b, 0), P(c2, d, 0))); l.Append(Line.CreateBound(P(c2, d, 0), P(a, d, 0))); l.Append(Line.CreateBound(P(a, d, 0), P(a, b, 0))); return l; }
        var loops = new List<CurveLoop> { Loop(x0, y0, x1, y1) };
        if (hole is { Length: 4 }) loops.Add(Loop(hole[0], hole[1], hole[2], hole[3]));
        Floor.Create(doc, loops, type.Id, level.Id);
    }

    static void MakeViews(Document doc, Geo g, Level dg)
    {
        var types = new FilteredElementCollector(doc).OfClass(typeof(ViewFamilyType)).Cast<ViewFamilyType>().ToList();
        var vft3 = types.First(t => t.ViewFamily == ViewFamily.ThreeDimensional);
        var vftPlan = types.First(t => t.ViewFamily == ViewFamily.FloorPlan);
        var solid = new FilteredElementCollector(doc).OfClass(typeof(FillPatternElement)).Cast<FillPatternElement>().FirstOrDefault(f => f.GetFillPattern().IsSolidFill);
        var black = new Color(0, 0, 0);
        var cut = new OverrideGraphicSettings();   // the cut of a wall, filled black like a wall section in a plan
        if (solid != null) { cut.SetCutForegroundPatternId(solid.Id); cut.SetCutForegroundPatternColor(black); }
        cut.SetCutLineColor(black);
        var walls = new ElementId(BuiltInCategory.OST_Walls);

        var plan = ViewPlan.Create(doc, vftPlan.Id, dg.Id);
        plan.Name = "US Grundriss DG"; plan.Scale = 50; plan.DetailLevel = ViewDetailLevel.Fine;
        var vr = plan.GetViewRange(); vr.SetOffset(PlanViewPlane.CutPlane, Ft(Math.Max(0.5, Math.Min(1.0, g.Knee - 0.1)))); plan.SetViewRange(vr);   // cut low enough to cut the knee walls
        plan.SetCategoryOverrides(walls, cut);

        View3D View3(string name, XYZ eye, XYZ look)
        {
            var v = View3D.CreateIsometric(doc, vft3.Id); v.Name = name;
            var fwd = (look - eye).Normalize(); var right = fwd.CrossProduct(XYZ.BasisZ).Normalize(); var up = right.CrossProduct(fwd).Normalize();
            v.SetOrientation(new ViewOrientation3D(eye, up, fwd));
            v.DetailLevel = ViewDetailLevel.Fine; v.DisplayStyle = DisplayStyle.Realistic;
            return v;
        }
        double ridge = g.Knee + g.Tan * g.W / 2, mid = g.Storey + ridge / 2;
        var centre = P(g.W / 2, g.D / 2, mid);
        View3("US 3D Aussen", P(-g.W * 0.9, g.D * 1.55, g.Storey + ridge * 1.2), centre);
        var roofOff = View3("US 3D Dach ab", P(-g.W * 1.1, g.D * 1.2, g.Storey + g.W * 1.6), P(g.W / 2, g.D / 2, g.Storey));
        roofOff.SetCategoryHidden(new ElementId(BuiltInCategory.OST_Roofs), true);
        roofOff.SetCategoryOverrides(walls, cut);
        var sec = View3("US 3D Schnitt", P(-g.W * 1.3, g.D * 0.85, g.Storey + g.W * 0.7), P(g.W / 2, g.D / 2, g.Storey + 0.8));
        sec.SetSectionBox(new BoundingBoxXYZ { Min = new XYZ(Ft(g.W / 2), Ft(-(g.D + 2)), Ft(-1)), Max = new XYZ(Ft(g.W + 2), Ft(2), Ft(g.Storey + ridge + 2)) });
        sec.SetCategoryOverrides(walls, cut);
    }

    static void ExportView(UIDocument uidoc, View v, string file)
    {
        try
        {
            try { uidoc.ActiveView = v; } catch (Exception ex) { L($"        could not make {v.Name} the active view: {ex.Message}"); }
            var stamp = DateTime.Now.AddSeconds(-2);
            var o = new ImageExportOptions
            {
                ExportRange = ExportRange.SetOfViews, FilePath = Path.Combine(Dir, file), FitDirection = FitDirectionType.Horizontal, ZoomType = ZoomFitType.FitToPage,
                PixelSize = 1920, ImageResolution = ImageResolution.DPI_150, HLRandWFViewsFileType = ImageFileType.PNG, ShadowViewsFileType = ImageFileType.PNG,
            };
            o.SetViewsAndSheets(new List<ElementId> { v.Id });
            uidoc.Document.ExportImage(o);
            var made = new DirectoryInfo(Dir).GetFiles(file + "*.png").Where(f => f.LastWriteTime >= stamp).OrderByDescending(f => f.LastWriteTime).FirstOrDefault();
            if (made != null && !string.Equals(made.Name, file + ".png", StringComparison.OrdinalIgnoreCase)) File.Move(made.FullName, Path.Combine(Dir, file + ".png"), true);
            L($"ok      picture {file}.png from {v.Name}");
        }
        catch (Exception ex) { L($"FAILED  picture of {v.Name}: {ex.Message}"); }
    }
}
