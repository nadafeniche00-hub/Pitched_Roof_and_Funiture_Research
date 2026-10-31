using System.Text.Json;
using Autodesk.Revit.ApplicationServices;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Structure;
using Autodesk.Revit.UI;

namespace UsableSpace;

/// <summary>
/// Reads families.txt next to this dll (lines: catalogue-type=path\to\family.rfa, # for comments, plus out=folder),
/// and for each family: new scratch project, load the family, place its first type at the origin, export IFC4,
/// and note the bounding box. Writes report.json into the output folder. Nothing in your own projects is touched.
/// Two ways in: the External Tools button (ExportFurniture), or once at Revit start-up (RunOnce) when run.flag exists
/// next to the dll; the flag is deleted first, so it never repeats.
/// </summary>
public static class Exporter
{
    private const double FeetToMetres = 0.3048;

    public static string Run(Autodesk.Revit.ApplicationServices.Application app, string dir)
    {
        var cfg = Path.Combine(dir, "families.txt");
        if (!File.Exists(cfg)) throw new FileNotFoundException("families.txt not found next to the add-in", cfg);
        string outDir = Path.Combine(dir, "out");
        var jobs = new List<(string Type, string Path)>();
        foreach (var raw in File.ReadAllLines(cfg))
        {
            var line = raw.Trim();
            if (line.Length == 0 || line.StartsWith('#')) continue;
            var i = line.IndexOf('=');
            if (i < 1) continue;
            var key = line[..i].Trim(); var val = line[(i + 1)..].Trim();
            if (key == "out") outDir = val; else jobs.Add((key, val));
        }
        Directory.CreateDirectory(outDir);
        var report = new List<Dictionary<string, object?>>();
        foreach (var (type, path) in jobs)
        {
            try { report.Add(ExportOne(app, type, path, outDir)); }
            catch (Exception e) { report.Add(new() { ["type"] = type, ["path"] = path, ["ok"] = false, ["error"] = e.GetType().Name + ": " + e.Message }); }
        }
        File.WriteAllText(Path.Combine(outDir, "report.json"), JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true }));
        return $"{report.Count(r => r["ok"] is true)} of {jobs.Count} families exported to {outDir}";
    }

    private static Dictionary<string, object?> ExportOne(Autodesk.Revit.ApplicationServices.Application app, string type, string path, string outDir)
    {
        if (!File.Exists(path)) throw new FileNotFoundException(path);
        var doc = app.NewProjectDocument(UnitSystem.Metric);
        try
        {
            Family? fam = null;
            ElementId? symbolId = null;
            using (var t = new Transaction(doc, "load"))
            {
                t.Start();
                if (!doc.LoadFamily(path, out fam) || fam == null) throw new InvalidOperationException("LoadFamily failed");
                symbolId = fam.GetFamilySymbolIds().FirstOrDefault() ?? throw new InvalidOperationException("family has no types");
                t.Commit();
            }
            BoundingBoxXYZ? box;
            using (var t = new Transaction(doc, "place"))
            {
                t.Start();
                var level = Level.Create(doc, 0);
                var sym = (FamilySymbol)doc.GetElement(symbolId);
                if (!sym.IsActive) { sym.Activate(); doc.Regenerate(); }
                var inst = doc.Create.NewFamilyInstance(XYZ.Zero, sym, level, StructuralType.NonStructural);
                doc.Regenerate();
                box = inst.get_BoundingBox(null);
                t.Commit();
            }
            var opts = new IFCExportOptions { FileVersion = IFCVersion.IFC4, ExportBaseQuantities = true };
            bool exported;
            using (var t = new Transaction(doc, "export")) { t.Start(); exported = doc.Export(outDir, type, opts); t.RollBack(); }
            double? Dim(Func<BoundingBoxXYZ, double> f) => box == null ? null : Math.Round(f(box) * FeetToMetres, 3);
            return new() { ["type"] = type, ["path"] = path, ["ok"] = exported, ["w"] = Dim(b => b.Max.X - b.Min.X), ["d"] = Dim(b => b.Max.Y - b.Min.Y), ["h"] = Dim(b => b.Max.Z - b.Min.Z), ["ifc"] = type + ".ifc" };
        }
        finally { doc.Close(false); }
    }
}

[Transaction(TransactionMode.Manual)]
public class ExportFurniture : IExternalCommand
{
    public Result Execute(ExternalCommandData data, ref string message, ElementSet elements)
    {
        try
        {
            var msg = Exporter.Run(data.Application.Application, Path.GetDirectoryName(typeof(ExportFurniture).Assembly.Location)!);
            TaskDialog.Show("Usable Space IFC export", msg);
            return Result.Succeeded;
        }
        catch (Exception e) { message = e.Message; return Result.Failed; }
    }
}

/// <summary>Runs the export once when Revit has finished starting, if run.flag sits next to the dll. Writes done.txt or error.txt.</summary>
public class RunOnce : IExternalApplication
{
    public Result OnStartup(UIControlledApplication c)
    {
        c.ControlledApplication.ApplicationInitialized += (sender, _) =>
        {
            var dir = Path.GetDirectoryName(typeof(RunOnce).Assembly.Location)!;
            var flag = Path.Combine(dir, "run.flag");
            if (!File.Exists(flag)) return;
            File.Delete(flag);
            try { File.WriteAllText(Path.Combine(dir, "done.txt"), Exporter.Run((Autodesk.Revit.ApplicationServices.Application)sender!, dir)); }
            catch (Exception e) { File.WriteAllText(Path.Combine(dir, "error.txt"), e.ToString()); }
        };
        return Result.Succeeded;
    }
    public Result OnShutdown(UIControlledApplication c) => Result.Succeeded;
}
