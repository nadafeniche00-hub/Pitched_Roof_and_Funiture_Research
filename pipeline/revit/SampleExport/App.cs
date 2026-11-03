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
/// with its slope and extent, and on the attic level (Dachgeschoss, or else the top level that has rooms) the rooms with their boundaries, the walls, floors, doors, windows and stairs.
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

    /// <summary>The attic level: a level whose name says Dachgeschoss (also Dachgeschoß, DG, attic); a plain "Dach" level only when nothing better exists.</summary>
    static Level? PickAttic(List<Level> levels)
    {
        bool Has(Level l, params string[] words) => words.Any(w => l.Name.Contains(w, StringComparison.OrdinalIgnoreCase));
        return levels.FirstOrDefault(l => Has(l, "Dachgeschoss", "Dachgeschoß", "Dachgeschos"))
            ?? levels.FirstOrDefault(l => l.Name.Trim().Equals("DG", StringComparison.OrdinalIgnoreCase) || l.Name.StartsWith("DG ", StringComparison.OrdinalIgnoreCase) || l.Name.StartsWith("DG_", StringComparison.OrdinalIgnoreCase))
            ?? levels.FirstOrDefault(l => Has(l, "Attic", "Dach", "Roof"));
    }

    static object Export(Application app, string path)
    {
        var doc = app.OpenDocumentFile(ModelPathUtils.ConvertUserVisiblePathToModelPath(path), new OpenOptions());
        try
        {
            Note($"opened {path} in {app.VersionName} ({app.VersionBuild})");
            var levels = new FilteredElementCollector(doc).OfClass(typeof(Level)).Cast<Level>().OrderBy(l => l.Elevation).ToList();
            var attic = PickAttic(levels);
            // no level called Dachgeschoss (a tower, a Japanese sample): the top level that has rooms is looked at in the same way
            attic ??= levels.LastOrDefault(l => new FilteredElementCollector(doc).OfCategory(BuiltInCategory.OST_Rooms).WhereElementIsNotElementType().Cast<Element>().Any(e => e.LevelId == l.Id));

            // how much every level holds: makes it possible to see at once whether the right level was taken
            IEnumerable<T> OnLevel<T>(Level l, BuiltInCategory? cat = null, Type? type = null) where T : Element
            {
                var c = new FilteredElementCollector(doc);
                var col = type != null ? c.OfClass(type) : cat != null ? c.OfCategory(cat.Value).WhereElementIsNotElementType() : c;
                return col.Cast<Element>().Where(e => e.LevelId == l.Id).OfType<T>();
            }
            var summary = levels.Select(l => new
            {
                name = l.Name,
                id = l.Id.Value,
                elevation_m = M(l.Elevation),
                rooms = OnLevel<SpatialElement>(l, BuiltInCategory.OST_Rooms).Count(),
                roomArea_m2 = M2(OnLevel<SpatialElement>(l, BuiltInCategory.OST_Rooms).OfType<Room>().Sum(r => r.Area)),
                walls = OnLevel<Wall>(l, type: typeof(Wall)).Count(),
                floors = OnLevel<Floor>(l, type: typeof(Floor)).Count(),
                windows = OnLevel<FamilyInstance>(l, BuiltInCategory.OST_Windows).Count(),
                doors = OnLevel<FamilyInstance>(l, BuiltInCategory.OST_Doors).Count(),
            }).ToList();
            foreach (var s in summary) Note($"level {s.name} at {s.elevation_m} m: {s.rooms} rooms ({s.roomArea_m2} m2), {s.walls} walls, {s.floors} floors, {s.windows} windows, {s.doors} doors");
            if (attic == null) Note("no level with rooms: only the levels are written");
            else if (!attic.Name.Contains("Dach", StringComparison.OrdinalIgnoreCase) && !attic.Name.Contains("DG", StringComparison.Ordinal)) Note($"no level named Dachgeschoss: the top level with rooms, {attic.Name}, is described instead");

            // roofs of the whole project (a roof sits on the level below the attic or on a level of its own): the converter picks the ones above the attic
            var roofs = Safe(new FilteredElementCollector(doc).OfClass(typeof(RoofBase)).Cast<Element>(), el =>
            {
                var r = (RoofBase)el;
                var profiles = new List<object>();
                if (r is FootPrintRoof fr)
                {
                    foreach (ModelCurveArray loop in fr.GetProfiles())
                        foreach (ModelCurve mc in loop)
                        {
                            var c = mc.GeometryCurve;
                            profiles.Add(new { p0 = P(c.GetEndPoint(0)), p1 = P(c.GetEndPoint(1)), definesSlope = fr.get_DefinesSlope(mc), slopeAngle = fr.get_SlopeAngle(mc), overhang_m = M(fr.get_Offset(mc)) });
                        }
                }
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

            // the rooms of every level, areas only (the boundaries follow for the attic): to compare what real storeys look like
            var roomsByLevel = levels.Select(l => new
            {
                level = l.Name,
                rooms = OnLevel<SpatialElement>(l, BuiltInCategory.OST_Rooms).OfType<Room>().Where(r => r.Area > 1e-6)
                    .Select(r => new { name = r.get_Parameter(BuiltInParameter.ROOM_NAME)?.AsString(), area_m2 = M2(r.Area), height_m = M(r.UnboundedHeight) }).ToList(),
            }).Where(x => x.rooms.Count > 0).ToList();

            object? detail = null;
            if (attic != null)
            {
                var rooms = Safe(OnLevel<SpatialElement>(attic, BuiltInCategory.OST_Rooms).OfType<Room>(), el =>
                {
                    var r = (Room)el;
                    if (r.Area <= 1e-6) return null; // not placed or not enclosed
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

                var walls = Safe(OnLevel<Wall>(attic, type: typeof(Wall)), el =>
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

                var floors = Safe(OnLevel<Floor>(attic, type: typeof(Floor)), el => (object)new
                {
                    id = el.Id.Value,
                    type = (doc.GetElement(el.GetTypeId()))?.Name,
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
                var windows = Safe(OnLevel<FamilyInstance>(attic, BuiltInCategory.OST_Windows), Opening, "window").ToList();
                var doors = Safe(OnLevel<FamilyInstance>(attic, BuiltInCategory.OST_Doors), Opening, "door").ToList();

                // stairs that reach the attic: from the level below or on the attic level itself
                var below = levels.LastOrDefault(l => l.Elevation < attic.Elevation - 1e-6);
                var stairs = Safe(new FilteredElementCollector(doc).OfClass(typeof(Stairs)).Cast<Element>().Where(s => s.LevelId == attic.Id || (below != null && s.LevelId == below.Id)), el => (object)new
                {
                    id = el.Id.Value,
                    type = doc.GetElement(el.GetTypeId())?.Name,
                    level = (doc.GetElement(el.LevelId) as Level)?.Name,
                    box = Box(el),
                }, "stair").ToList();

                detail = new { level = new { name = attic.Name, id = attic.Id.Value, elevation_m = M(attic.Elevation), above = levels.FirstOrDefault(l => l.Elevation > attic.Elevation + 1e-6)?.Name }, rooms, walls, floors, windows, doors, stairs };
                Note($"attic {attic.Name}: {rooms.Count} rooms, {walls.Count} walls, {floors.Count} floors, {windows.Count} windows, {doors.Count} doors, {stairs.Count} stairs; {roofs.Count} roofs in the project");
            }

            return new
            {
                source = Path.GetFileName(path),
                sourcePath = path,
                revitBuild = app.VersionBuild,
                revitVersion = app.VersionName,
                language = app.Language.ToString(),
                units = "m, mm for thicknesses; Revit internal origin, y up (north)",
                levels = summary,
                roomsByLevel,
                roofs,
                attic = detail,
            };
        }
        finally { doc.Close(false); }
    }
}
