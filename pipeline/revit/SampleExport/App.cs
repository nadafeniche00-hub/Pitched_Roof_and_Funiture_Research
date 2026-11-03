using System.Text.Encodings.Web;
using System.Text.Json;
using Autodesk.Revit.ApplicationServices;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;
using Autodesk.Revit.DB.Events;
using Autodesk.Revit.UI;

namespace SampleExport;

/// <summary>
/// Reads the architecture samples of Revit: for every path in samples.txt it opens the project (read only, it is never saved) and writes the levels (with the rooms and areas on each), every roof
/// with its slope and extent, and on every storey that lies directly under a roof (a level called Dachgeschoss comes first; else the top level with rooms) the rooms with their boundaries, the walls, floors, doors, windows and stairs.
/// The result is samples.json next to samples.txt; done.txt or error.txt tells run.ps1 that it is finished. Metres, Revit's internal origin, y up (north).
/// pipeline/revit/convert_sample.mjs turns the file into templates of the app and into cases for the rule check.
/// </summary>
public class App : IExternalApplication
{
    static readonly string Root = Environment.GetEnvironmentVariable("SAMPLE_EXPORT_DIR") ?? Path.Combine(Path.GetTempPath(), "sampleexport");
    static readonly List<string> Log = new();

    public Result OnStartup(UIControlledApplication a)
    {
        a.ControlledApplication.ApplicationInitialized += OnInit;
        return Result.Succeeded;
    }

    public Result OnShutdown(UIControlledApplication a) => Result.Succeeded;

    void OnInit(object? sender, ApplicationInitializedEventArgs e)
    {
        try
        {
            var app = (Application)sender!;
            var paths = File.ReadAllLines(Path.Combine(Root, "samples.txt")).Select(l => l.Trim()).Where(l => l.Length > 0).ToList();
            var results = new List<object>();
            foreach (var p in paths)
            {
                try { results.Add(Export(app, p)); }
                catch (Exception ex) { Note($"{p}: {ex.Message}"); results.Add(new { source = Path.GetFileName(p), error = ex.ToString() }); }
            }
            var opt = new JsonSerializerOptions { WriteIndented = true, Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
            File.WriteAllText(Path.Combine(Root, "samples.json"), JsonSerializer.Serialize(results, opt));
            File.WriteAllText(Path.Combine(Root, "export_log.txt"), string.Join(Environment.NewLine, Log));
            File.WriteAllText(Path.Combine(Root, "done.txt"), "ok");
        }
        catch (Exception ex)
        {
            File.WriteAllText(Path.Combine(Root, "error.txt"), ex.ToString());
        }
    }

    static double M(double feet) => Math.Round(UnitUtils.ConvertFromInternalUnits(feet, UnitTypeId.Meters), 3);
    static double Mm(double feet) => Math.Round(UnitUtils.ConvertFromInternalUnits(feet, UnitTypeId.Millimeters), 1);
    static double M2(double sqFeet) => Math.Round(UnitUtils.ConvertFromInternalUnits(sqFeet, UnitTypeId.SquareMeters), 2);
    static double[] P(XYZ p) => new[] { M(p.X), M(p.Y), M(p.Z) };
    static void Note(string s) => Log.Add($"{DateTime.Now:HH:mm:ss}  {s}");

    /// <summary>One element's data, or nothing when reading it fails: a single odd element never takes the export down.</summary>
    static IEnumerable<T> Safe<T>(IEnumerable<Element> items, Func<Element, T?> read, string what) where T : class
    {
        int failed = 0;
        foreach (var el in items)
        {
            T? v = null;
            try { v = read(el); } catch (Exception ex) { failed++; if (failed <= 3) Note($"{what} {el.Id.Value}: {ex.Message}"); }
            if (v != null) yield return v;
        }
        if (failed > 0) Note($"{what}: {failed} elements could not be read");
    }

    static object? Box(Element el)
    {
        var bb = el.get_BoundingBox(null);
        return bb == null ? null : new { min = P(bb.Min), max = P(bb.Max) };
    }

    static double? Param(Element el, BuiltInParameter bip, Func<double, double> convert)
    {
        var p = el.get_Parameter(bip);
        return p != null && p.HasValue && p.StorageType == StorageType.Double ? convert(p.AsDouble()) : null;
    }

    static double Ft(double meters) => UnitUtils.ConvertToInternalUnits(meters, UnitTypeId.Meters);

    static bool Overlap(BoundingBoxXYZ a, BoundingBoxXYZ b) => a.Max.X > b.Min.X && a.Min.X < b.Max.X && a.Max.Y > b.Min.Y && a.Min.Y < b.Max.Y;

    static BoundingBoxXYZ Union(BoundingBoxXYZ? u, BoundingBoxXYZ b) => u == null ? new BoundingBoxXYZ { Min = b.Min, Max = b.Max } : new BoundingBoxXYZ
    {
        Min = new XYZ(Math.Min(u.Min.X, b.Min.X), Math.Min(u.Min.Y, b.Min.Y), Math.Min(u.Min.Z, b.Min.Z)),
        Max = new XYZ(Math.Max(u.Max.X, b.Max.X), Math.Max(u.Max.Y, b.Max.Y), Math.Max(u.Max.Z, b.Max.Z)),
    };

    /// <summary>A level whose name says Dachgeschoss (also Dachgeschoß, DG, attic) and that has rooms.</summary>
    static Level? NamedAttic(List<Level> roomLevels)
    {
        bool Has(Level l, params string[] words) => words.Any(w => l.Name.Contains(w, StringComparison.OrdinalIgnoreCase));
        return roomLevels.FirstOrDefault(l => Has(l, "Dachgeschoss", "Dachgeschoß", "Dachgeschos"))
            ?? roomLevels.FirstOrDefault(l => l.Name.Trim().Equals("DG", StringComparison.OrdinalIgnoreCase) || l.Name.StartsWith("DG ", StringComparison.OrdinalIgnoreCase) || l.Name.StartsWith("DG_", StringComparison.OrdinalIgnoreCase))
            ?? roomLevels.FirstOrDefault(l => Has(l, "Attic"));
    }

    static object Export(Application app, string path)
    {
        var doc = app.OpenDocumentFile(ModelPathUtils.ConvertUserVisiblePathToModelPath(path), new OpenOptions());
        try
        {
            Note($"opened {path} in {app.VersionName} ({app.VersionBuild})");
            var levels = new FilteredElementCollector(doc).OfClass(typeof(Level)).Cast<Level>().OrderBy(l => l.Elevation).ToList();

            IEnumerable<T> OnLevel<T>(Level l, BuiltInCategory? cat = null, Type? type = null) where T : Element
            {
                var c = new FilteredElementCollector(doc);
                var col = type != null ? c.OfClass(type) : cat != null ? c.OfCategory(cat.Value).WhereElementIsNotElementType() : c;
                return col.Cast<Element>().Where(e => e.LevelId == l.Id).OfType<T>();
            }
            // a Revit project has many levels for one storey (finished floor, raw floor, structure): an element belongs to a storey when its level lies within 0.45 m of it
            bool SameStorey(Element e, Level l) => doc.GetElement(e.LevelId) is Level el && Math.Abs(el.Elevation - l.Elevation) <= Ft(0.45);
            IEnumerable<Room> RoomsOn(Level l) => OnLevel<SpatialElement>(l, BuiltInCategory.OST_Rooms).OfType<Room>().Where(r => r.Area > 1e-6);

            var roomLevels = levels.Where(l => RoomsOn(l).Any()).ToList();
            var summary = levels.Select(l => new
            {
                name = l.Name,
                id = l.Id.Value,
                elevation_m = M(l.Elevation),
                rooms = RoomsOn(l).Count(),
                roomArea_m2 = M2(RoomsOn(l).Sum(r => r.Area)),
                walls = OnLevel<Wall>(l, type: typeof(Wall)).Count(),
                floors = OnLevel<Floor>(l, type: typeof(Floor)).Count(),
                windows = OnLevel<FamilyInstance>(l, BuiltInCategory.OST_Windows).Count(),
                doors = OnLevel<FamilyInstance>(l, BuiltInCategory.OST_Doors).Count(),
            }).ToList();
            foreach (var s in summary.Where(s => s.rooms > 0 || s.walls > 0)) Note($"level {s.name} at {s.elevation_m} m: {s.rooms} rooms ({s.roomArea_m2} m2), {s.walls} walls, {s.floors} floors, {s.windows} windows, {s.doors} doors");

            // roofs of the whole project. An edge of a footprint roof that does not define the slope refuses to give its angle: ask only the ones that define it
            var roofBoxes = new List<BoundingBoxXYZ>();
            var roofs = Safe(new FilteredElementCollector(doc).OfClass(typeof(RoofBase)).Cast<Element>(), el =>
            {
                var r = (RoofBase)el;
                var profiles = new List<object>();
                if (r is FootPrintRoof fr)
                {
                    try
                    {
                        foreach (ModelCurveArray loop in fr.GetProfiles())
                            foreach (ModelCurve mc in loop)
                            {
                                var c = mc.GeometryCurve;
                                bool defines = false;
                                double? slope = null;
                                try { defines = fr.get_DefinesSlope(mc); if (defines) slope = fr.get_SlopeAngle(mc); } catch { /* an edge that cannot say */ }
                                profiles.Add(new { p0 = P(c.GetEndPoint(0)), p1 = P(c.GetEndPoint(1)), definesSlope = defines, slopeAngle = slope });
                            }
                    }
                    catch (Exception ex) { Note($"roof {r.Id.Value} profiles: {ex.Message}"); }
                }
                var bb = r.get_BoundingBox(null);
                if (bb != null) roofBoxes.Add(bb);
                return (object)new
                {
                    id = r.Id.Value,
                    kind = r.GetType().Name,
                    type = r.RoofType?.Name,
                    level = (doc.GetElement(r.LevelId) as Level)?.Name,
                    area_m2 = Param(r, BuiltInParameter.HOST_AREA_COMPUTED, M2),
                    slopeParam = Param(r, BuiltInParameter.ROOF_SLOPE, v => Math.Round(v, 4)),
                    thickness_mm = Param(r, BuiltInParameter.ROOF_ATTR_THICKNESS_PARAM, Mm),
                    box = Box(r),
                    profiles,
                };
            }, "roof").ToList();

            // the storeys directly under a roof: rooms on the level, a roof over them that starts 1.5 to 7 m above the floor, and no other storey with rooms between. A level called Dachgeschoss comes first.
            var roomBox = roomLevels.ToDictionary(l => l.Id.Value, l => RoomsOn(l).Select(r => r.get_BoundingBox(null)).Where(b => b != null).Aggregate((BoundingBoxXYZ?)null, (u, b) => Union(u, b!)));
            var under = new List<Level>();
            var named = NamedAttic(roomLevels);
            if (named != null) under.Add(named);
            foreach (var l in roomLevels)
            {
                var rb = roomBox[l.Id.Value];
                if (rb == null || under.Contains(l)) continue;
                var roof = roofBoxes.Where(b => Overlap(b, rb) && b.Min.Z >= l.Elevation + Ft(1.5) && b.Min.Z <= l.Elevation + Ft(7)).OrderBy(b => b.Min.Z).FirstOrDefault();
                if (roof == null) continue;
                bool covered = roomLevels.Any(o => o != l && o.Elevation > l.Elevation + Ft(0.5) && o.Elevation < roof.Min.Z && roomBox[o.Id.Value] is { } ob && Overlap(ob, rb));
                if (!covered) under.Add(l);
            }
            under = under.OrderByDescending(l => RoomsOn(l).Count()).Take(4).ToList();
            bool fallback = under.Count == 0;
            if (fallback && roomLevels.Count > 0) under.Add(roomLevels[^1]);
            foreach (var l in under) Note(fallback ? $"no storey under a roof: the top level with rooms, {l.Name}, is described instead" : $"storey under a roof: {l.Name} at {M(l.Elevation)} m");
            if (roomLevels.Count == 0) Note("no level with rooms: only the levels are written");

            object Describe(Level lvl)
            {
                var rooms = Safe(RoomsOn(lvl), el =>
                {
                    var r = (Room)el;
                    var loops = new List<object>();
                    var segs = r.GetBoundarySegments(new SpatialElementBoundaryOptions { SpatialElementBoundaryLocation = SpatialElementBoundaryLocation.Finish });
                    if (segs != null)
                        foreach (var loop in segs)
                            loops.Add(loop.Select(s => { var pts = s.GetCurve().Tessellate(); return new[] { M(pts[0].X), M(pts[0].Y) }; }).ToList());
                    return (object)new
                    {
                        id = r.Id.Value,
                        name = r.get_Parameter(BuiltInParameter.ROOM_NAME)?.AsString(),
                        number = r.Number,
                        area_m2 = M2(r.Area),
                        perimeter_m = M(r.Perimeter),
                        height_m = M(r.UnboundedHeight),
                        department = r.get_Parameter(BuiltInParameter.ROOM_DEPARTMENT)?.AsString(),
                        loops,
                    };
                }, "room").ToList();

                // walls stand on the raw-floor level of a storey, not on the finished-floor level that the rooms use: take the walls whose base is within 0.45 m of the floor
                var walls = Safe(new FilteredElementCollector(doc).OfClass(typeof(Wall)).Cast<Element>().Where(w => w.get_BoundingBox(null) is { } b && Math.Abs(b.Min.Z - lvl.Elevation) <= Ft(0.45)), el =>
                {
                    var w = (Wall)el;
                    var line = (w.Location as LocationCurve)?.Curve;
                    if (line == null) return null;
                    return (object)new
                    {
                        id = w.Id.Value,
                        type = w.WallType.Name,
                        function = w.WallType.Function.ToString(),
                        width_mm = Mm(w.Width),
                        p0 = P(line.GetEndPoint(0)),
                        p1 = P(line.GetEndPoint(1)),
                        baseOffset_m = Param(w, BuiltInParameter.WALL_BASE_OFFSET, M),
                        userHeight_m = Param(w, BuiltInParameter.WALL_USER_HEIGHT_PARAM, M),
                        box = Box(w),
                    };
                }, "wall").ToList();

                var floors = Safe(new FilteredElementCollector(doc).OfClass(typeof(Floor)).Cast<Element>().Where(f => SameStorey(f, lvl)), el => (object)new
                {
                    id = el.Id.Value,
                    type = doc.GetElement(el.GetTypeId())?.Name,
                    area_m2 = Param(el, BuiltInParameter.HOST_AREA_COMPUTED, M2),
                    thickness_mm = Param(el, BuiltInParameter.FLOOR_ATTR_THICKNESS_PARAM, Mm),
                    box = Box(el),
                }, "floor").ToList();

                object? Opening(Element el)
                {
                    var fi = (FamilyInstance)el;
                    var at = (fi.Location as LocationPoint)?.Point;
                    if (at == null) return null;
                    var sym = fi.Symbol;
                    double? Dim(params BuiltInParameter[] bips) => bips.Select(b => Param(fi, b, Mm) ?? Param(sym, b, Mm)).FirstOrDefault(v => v != null && v > 0);
                    return new
                    {
                        id = fi.Id.Value,
                        family = sym.FamilyName,
                        type = sym.Name,
                        at = P(at),
                        facing = fi.FacingOrientation == null ? null : new[] { Math.Round(fi.FacingOrientation.X, 3), Math.Round(fi.FacingOrientation.Y, 3) },
                        hostWall = fi.Host?.Id.Value,
                        width_mm = Dim(BuiltInParameter.FAMILY_WIDTH_PARAM, BuiltInParameter.DOOR_WIDTH, BuiltInParameter.WINDOW_WIDTH),
                        height_mm = Dim(BuiltInParameter.FAMILY_HEIGHT_PARAM, BuiltInParameter.DOOR_HEIGHT, BuiltInParameter.WINDOW_HEIGHT),
                        sill_mm = Param(fi, BuiltInParameter.INSTANCE_SILL_HEIGHT_PARAM, Mm),
                    };
                }
                IEnumerable<Element> OpeningsOf(BuiltInCategory cat) => new FilteredElementCollector(doc).OfCategory(cat).WhereElementIsNotElementType().Cast<Element>().Where(e => e is FamilyInstance && SameStorey(e, lvl));
                var windows = Safe(OpeningsOf(BuiltInCategory.OST_Windows), Opening, "window").ToList();
                var doors = Safe(OpeningsOf(BuiltInCategory.OST_Doors), Opening, "door").ToList();

                var rb = roomBox[lvl.Id.Value];
                var stairs = Safe(new FilteredElementCollector(doc).OfClass(typeof(Stairs)).Cast<Element>().Where(s => s.get_BoundingBox(null) is { } b && rb != null && Overlap(b, rb) && b.Max.Z > lvl.Elevation - Ft(0.5) && b.Min.Z < lvl.Elevation + Ft(3)), el => (object)new
                {
                    id = el.Id.Value,
                    type = doc.GetElement(el.GetTypeId())?.Name,
                    level = (doc.GetElement(el.LevelId) as Level)?.Name,
                    box = Box(el),
                }, "stair").ToList();

                Note($"{lvl.Name}: {rooms.Count} rooms, {walls.Count} walls, {floors.Count} floors, {windows.Count} windows, {doors.Count} doors, {stairs.Count} stairs");
                return new { level = new { name = lvl.Name, id = lvl.Id.Value, elevation_m = M(lvl.Elevation) }, rooms, walls, floors, windows, doors, stairs };
            }
            var attics = under.Select(Describe).ToList();
            Note($"{roofs.Count} roofs in the project");

            return new
            {
                source = Path.GetFileName(path),
                sourcePath = path,
                revitBuild = app.VersionBuild,
                revitVersion = app.VersionName,
                language = app.Language.ToString(),
                units = "m, mm for thicknesses; Revit internal origin, y up (north)",
                levels = summary,
                roofs,
                fallback,
                attics,
            };
        }
        finally { doc.Close(false); }
    }
}
