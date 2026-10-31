using System.Text.Json;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Structure;
using Autodesk.Revit.UI;

namespace UsableSpace;

/// <summary>
/// Reads families.txt next to this dll (lines: catalogue-type=path\to\family.rfa, # for comments, plus out=folder),
/// and for each family: new scratch project, load the family, place its first type at the origin, export IFC4,
/// and note the bounding box. Writes report.json into the output folder. Nothing in your own projects is touched.
/// </summary>
[Transaction(TransactionMode.Manual)]
public class ExportFurniture : IExternalCommand
{
    private const double FeetToMetres = 0.3048;

    public Result Execute(ExternalCommandData data, ref string message, ElementSet elements)
    {
        var app = data.Application.Application;
        var dir = Path.GetDirectoryName(typeof(ExportFurniture).Assembly.Location)!;
        var cfg = Path.Combine(dir, "families.txt");
        if (!File.Exists(cfg)) { message = "families.txt not found next to the add-in: " + cfg; return Result.Failed; }

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

        var report = new List<object>();
        foreach (var (type, path) in jobs)
        {
            try { report.Add(ExportOne(app, type, path, outDir)); }
            catch (Exception e) { report.Add(new { type, path, ok = false, error = e.GetType().Name + ": " + e.Message }); }
        }
        File.WriteAllText(Path.Combine(outDir, "report.json"), JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true }));
        var ok = report.Count(r => r.ToString()!.Contains("ok = True"));
        TaskDialog.Show("Usable Space IFC export", $"{ok} of {jobs.Count} families exported to\n{outDir}\nSee report.json for sizes and errors.");
        return Result.Succeeded;
    }

    private static object ExportOne(Autodesk.Revit.ApplicationServices.Application app, string type, string path, string outDir)
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
            double? w = box == null ? null : (box.Max.X - box.Min.X) * FeetToMetres;
            double? d = box == null ? null : (box.Max.Y - box.Min.Y) * FeetToMetres;
            double? h = box == null ? null : (box.Max.Z - box.Min.Z) * FeetToMetres;
            return new { type, path, ok = exported, w, d, h, ifc = type + ".ifc" };
        }
        finally { doc.Close(false); }
    }
}
