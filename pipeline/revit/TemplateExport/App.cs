using System.Text.Encodings.Web;
using System.Text.Json;
using Autodesk.Revit.ApplicationServices;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Events;
using Autodesk.Revit.UI;

namespace TemplateExport;

/// <summary>
/// Reads the roof types of Revit project templates. For every path in templates.txt it creates a project from the template
/// (Application.NewProjectDocument), lists every RoofType with its compound structure (layers, functions, thicknesses, materials)
/// and type parameters, the materials those layers use (appearance, thermal, patterns) and the graphics settings of the Roofs category.
/// The result is roof_templates.json next to templates.txt; done.txt or error.txt tells run.ps1 that it is finished.
/// </summary>
public class App : IExternalApplication
{
    static readonly string Root = Environment.GetEnvironmentVariable("TPL_EXPORT_DIR") ?? Path.Combine(Path.GetTempPath(), "tplexport");

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
            var paths = File.ReadAllLines(Path.Combine(Root, "templates.txt")).Select(l => l.Trim()).Where(l => l.Length > 0).ToList();
            var results = new List<object>();
            foreach (var p in paths)
            {
                try { results.Add(Export(app, p)); }
                catch (Exception ex) { results.Add(new { template = p, error = ex.ToString() }); }
            }
            var opt = new JsonSerializerOptions { WriteIndented = true, Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
            File.WriteAllText(Path.Combine(Root, "roof_templates.json"), JsonSerializer.Serialize(results, opt));
            File.WriteAllText(Path.Combine(Root, "done.txt"), "ok");
        }
        catch (Exception ex)
        {
            File.WriteAllText(Path.Combine(Root, "error.txt"), ex.ToString());
        }
    }

    static double Mm(double feet) => Math.Round(UnitUtils.ConvertFromInternalUnits(feet, UnitTypeId.Millimeters), 3);
    static string Rgb(Color? c) => c == null || !c.IsValid ? "" : $"#{c.Red:x2}{c.Green:x2}{c.Blue:x2}";

    static string? Name(Document doc, ElementId id) => id == ElementId.InvalidElementId ? null : doc.GetElement(id)?.Name;

    static object Export(Application app, string path)
    {
        var doc = app.NewProjectDocument(path);
        try
        {
            var types = new FilteredElementCollector(doc).OfClass(typeof(RoofType)).Cast<RoofType>()
                .OrderBy(t => t.FamilyName).ThenBy(t => t.Name).ToList();
            var usedMaterials = new Dictionary<long, Material>();
            var roofTypes = new List<object>();

            foreach (var t in types)
            {
                var cs = t.GetCompoundStructure();
                var layers = new List<object>();
                if (cs != null)
                {
                    var ls = cs.GetLayers();
                    for (int i = 0; i < ls.Count; i++)
                    {
                        var l = ls[i];
                        if (doc.GetElement(l.MaterialId) is Material m) usedMaterials[m.Id.Value] = m;
                        layers.Add(new
                        {
                            index = i,
                            function = l.Function.ToString(),
                            thickness_mm = Mm(l.Width),
                            material = Name(doc, l.MaterialId),
                            materialId = l.MaterialId.Value,
                            isCore = i >= cs.GetFirstCoreLayerIndex() && i <= cs.GetLastCoreLayerIndex(),
                            isStructuralMaterial = i == cs.StructuralMaterialIndex,
                            isVariable = i == cs.VariableLayerIndex,
                        });
                    }
                }

                var parameters = new Dictionary<string, string>();
                foreach (Parameter p in t.Parameters)
                {
                    string? v = null;
                    try { v = p.StorageType == StorageType.String ? p.AsString() : p.AsValueString(); } catch { }
                    if (!string.IsNullOrWhiteSpace(v)) parameters[p.Definition.Name] = v!;
                }

                roofTypes.Add(new
                {
                    name = t.Name,
                    family = t.FamilyName,
                    id = t.Id.Value,
                    totalThickness_mm = cs == null ? (double?)null : Mm(cs.GetWidth()),
                    layerCount = layers.Count,
                    isSimple = cs?.IsVerticallyCompound,
                    layers,
                    parameters,
                });
            }

            var materials = new List<object>();
            foreach (var m in usedMaterials.Values.OrderBy(m => m.Name))
            {
                object? thermal = null;
                try
                {
                    if (doc.GetElement(m.ThermalAssetId) is PropertySetElement pse)
                    {
                        var th = pse.GetThermalAsset();
                        thermal = new
                        {
                            name = pse.Name,
                            conductivity_W_mK = Math.Round(UnitUtils.ConvertFromInternalUnits(th.ThermalConductivity, UnitTypeId.WattsPerMeterKelvin), 4),
                            density_kg_m3 = Math.Round(UnitUtils.ConvertFromInternalUnits(th.Density, UnitTypeId.KilogramsPerCubicMeter), 2),
                        };
                    }
                }
                catch { }
                materials.Add(new
                {
                    name = m.Name,
                    id = m.Id.Value,
                    materialClass = m.MaterialClass,
                    materialCategory = m.MaterialCategory,
                    color = Rgb(m.Color),
                    transparency = m.Transparency,
                    shininess = m.Shininess,
                    smoothness = m.Smoothness,
                    appearanceAsset = Name(doc, m.AppearanceAssetId),
                    surfacePattern = Name(doc, m.SurfaceForegroundPatternId),
                    surfacePatternColor = Rgb(m.SurfaceForegroundPatternColor),
                    cutPattern = Name(doc, m.CutForegroundPatternId),
                    cutPatternColor = Rgb(m.CutForegroundPatternColor),
                    thermal,
                });
            }

            object? category = null;
            try
            {
                var cat = doc.Settings.Categories.get_Item(BuiltInCategory.OST_Roofs);
                category = new
                {
                    name = cat.Name,
                    lineColor = Rgb(cat.LineColor),
                    lineWeightProjection = cat.GetLineWeight(GraphicsStyleType.Projection),
                    lineWeightCut = cat.GetLineWeight(GraphicsStyleType.Cut),
                    material = cat.Material?.Name,
                    subCategories = cat.SubCategories.Cast<Category>().Select(s => new
                    {
                        name = s.Name,
                        lineColor = Rgb(s.LineColor),
                        lineWeightProjection = s.GetLineWeight(GraphicsStyleType.Projection),
                        lineWeightCut = s.GetLineWeight(GraphicsStyleType.Cut),
                    }).ToList(),
                };
            }
            catch { }

            // roof related families: skylights, dormers, fascias, gutters
            var related = new List<object>();
            foreach (var bic in new[] { BuiltInCategory.OST_Windows, BuiltInCategory.OST_GenericModel, BuiltInCategory.OST_Fascia, BuiltInCategory.OST_Gutter })
            {
                foreach (var s in new FilteredElementCollector(doc).OfCategory(bic).WhereElementIsElementType())
                {
                    var n = (s is FamilySymbol fs ? fs.FamilyName + " : " : "") + s.Name;
                    if (bic is BuiltInCategory.OST_Fascia or BuiltInCategory.OST_Gutter || n.Contains("Dach", StringComparison.OrdinalIgnoreCase) || n.Contains("Gaube", StringComparison.OrdinalIgnoreCase) || n.Contains("Roof", StringComparison.OrdinalIgnoreCase))
                        related.Add(new { category = bic.ToString(), name = n });
                }
            }

            return new
            {
                template = Path.GetFileName(path),
                templatePath = path,
                revitBuild = app.VersionBuild,
                revitVersion = app.VersionName,
                language = app.Language.ToString(),
                units = "mm",
                roofTypeCount = roofTypes.Count,
                roofTypes,
                materials,
                category,
                related,
            };
        }
        finally { doc.Close(false); }
    }
}
