"""Product metadata (plain-language definitions, caveats) and sanity checks for the NASA satellite library."""
import numpy as np
import libcommon as L

IMERG_CAV = ("Precipitation only (rain and snow water), not a measure of soil wetness or river flow. Final Run is calibrated to monthly rain-gauge analyses where gauges exist, so skill is best over land with many gauges "
             "and weaker over high latitudes, ice and snow, and steep terrain. The record joins the older TRMM-era and the GPM-era satellite constellations, so small steps are possible. Ocean cells are included.")
AOD_CAV = ("Daytime, cloud-free views only: monthly means use only the days and places where the satellite could see the surface, and bright snow, ice and desert surfaces or persistent cloud give gaps. "
           "Aqua's afternoon overpass time has drifted later since July 2021 (NSIDC data announcement, 28 Oct 2021), so a small part of any change after 2021 can come from the changing view time and not from the air. "
           "Dark Target and Deep Blue retrievals are merged by NASA into one 550 nm value.")
TWS_CAV = ("Total water storage anomaly, not groundwater alone: it adds up snow, ice, surface water, soil moisture and groundwater, and shows change relative to the 2004-2009 average, not an absolute amount. "
           "The satellites measure gravity over areas of roughly 300 km (about 3 degrees), so small regions are blurred and a 1-degree cell is not an independent measurement. "
           "There is a gap between GRACE (ended Jun 2017) and GRACE-FO (began Jun 2018) and a few single missing months; those are left empty, not filled. Solid-earth effects (glacial rebound) are removed by NASA's model, not measured.")
LST_CAV = ("Land surface temperature is the temperature of the ground and plant surface as seen from space (skin temperature), not the air temperature at weather stations, and it is only observed on clear-sky days, so cloudy places and seasons are under-sampled. "
           "Aqua passes at about 1:30 PM local time, so this is a mid-afternoon temperature, and Aqua's overpass time has drifted later since July 2021 (NSIDC 2021) while Terra, which we did not use, drifts earlier. "
           "Daytime only; ocean and water are not included; values are converted from kelvin to degrees Celsius once.")
SNOW_CAV = ("Percent of the ground that the satellite saw covered by snow on clear-sky days in the month, not snow depth or water content. Clouds hide the ground, and in polar night no data are collected, so high-latitude winter is empty. "
            "Terra's overpass time has drifted earlier since 2020 (NSIDC 2021), which can change snow-cover estimates slightly after 2020. Land only.")

PRODUCTS = {
 "precip_imerg": dict(name="Precipitation (rain and snow)", short="GPM IMERG Final monthly V07 (GPM_3IMERGM)", units="mm/day", scale=0.05, offset=0.0,
    definition="How much rain and snow water reaches the ground, shown as the average amount per day over each month (millimetres of water per day).",
    caveats=IMERG_CAV, source_var="/Grid/precipitation (mm/hr x 24)", kind="satellite observation (multi-satellite, gauge-calibrated)", native="0.1 degree, block-averaged to 1 degree",
    cid="C2723754851-GES_DISC", agency="NASA GES DISC"),
 "aod_myd08": dict(name="Aerosol optical depth (haze)", short="MODIS Aqua MYD08_M3 v6.1", units="1 (unitless)", scale=0.001, offset=0.0,
    definition="How much haze (dust, smoke and pollution particles) blocks sunlight in the whole air column above a place, at green light (550 nm). Near 0.05 is very clean air; above 0.5 is thick haze.",
    caveats=AOD_CAV, source_var="AOD_550_Dark_Target_Deep_Blue_Combined_Mean_Mean", kind="satellite observation", native="1 degree (native)", cid="C1443775657-LAADS", agency="NASA LAADS DAAC"),
 "tws_grace": dict(name="Terrestrial water storage anomaly", short="GRACE and GRACE-FO JPL mascons RL06.3 v04 (CRI)", units="cm (equivalent water height)", scale=0.1, offset=0.0,
    definition="How much more or less water is stored on and under the ground than the 2004-2009 average, written as the height of a layer of water spread over the area (centimetres). Snow, ice, lakes, soil moisture and groundwater all count together.",
    caveats=TWS_CAV, source_var="lwe_thickness", kind="satellite observation (gravity)", native="0.5 degree grid (effective resolution about 3 degrees), block-averaged to 1 degree", cid="C3195527175-POCLOUD", agency="NASA PO.DAAC"),
 "lst_day_myd11": dict(name="Land surface temperature (day)", short="MODIS Aqua MYD11C3 v061", units="degC", scale=0.01, offset=0.0,
    definition="How hot the ground surface is in the early afternoon, as seen from space on clear days, averaged over the month (degrees Celsius). It is hotter than the air temperature in sun-baked places.",
    caveats=LST_CAV, source_var="LST_Day_CMG (K x 0.02 minus 273.15)", kind="satellite observation", native="0.05 degree, block-averaged to 1 degree", cid="C2565794044-LPCLOUD", agency="NASA LP DAAC"),
 "snow_mod10cm": dict(name="Snow cover", short="MODIS Terra MOD10CM v061", units="% of land area", scale=0.01, offset=0.0,
    definition="The share of the ground (in percent) that the satellite saw covered by snow during the month, on days when it could see the ground.",
    caveats=SNOW_CAV, source_var="Coverage of snow", kind="satellite observation", native="0.05 degree, block-averaged to 1 degree", cid="C3050353608-NSIDC_CPRD", agency="NASA NSIDC DAAC"),
}


def sanity(pid, cube, times):
    """Return list of strings. Known-pattern checks on the library itself; recorded as sanity checks, not findings."""
    out = []
    B = L.box
    jja, djf = (6, 7, 8), (12, 1, 2)
    if pid == "precip_imerg":
        n10 = B(cube, 0, 10, -180, 180); s10 = B(cube, -10, 0, -180, 180)
        out.append(f"ITCZ seasonality: 0-10N zonal-band mean rain JJA {L.season_mean(n10, times, jja):.2f} vs DJF {L.season_mean(n10, times, djf):.2f} mm/day (expect JJA > DJF); "
                   f"0-10S JJA {L.season_mean(s10, times, jja):.2f} vs DJF {L.season_mean(s10, times, djf):.2f} (expect DJF > JJA).")
        sah = B(cube, 18, 28, -10, 30); con = B(cube, -5, 5, 10, 30); am = B(cube, -10, 0, -70, -55)
        out.append(f"Wet and dry places (all-month mean mm/day): Sahara 18-28N 10W-30E {np.nanmean(sah):.2f} (expect very low), Congo basin {np.nanmean(con):.2f}, Amazon {np.nanmean(am):.2f} (expect high).")
        sahel = B(cube, 10, 18, -17, 25)
        out.append(f"Sahel 10-18N 17W-25E: JJAS mean {L.season_mean(sahel, times, (6,7,8,9)):.2f} vs DJF {L.season_mean(sahel, times, djf):.2f} mm/day (expect monsoon JJAS >> DJF).")
    elif pid == "aod_myd08":
        sah = B(cube, 15, 25, -20, 10)
        out.append(f"Saharan dust: West Sahara/Atlantic outflow 15-25N 20W-10E mean AOD JJA {L.season_mean(sah, times, jja):.3f} vs DJF {L.season_mean(sah, times, djf):.3f} (expect JJA higher).")
        ind = B(cube, 22, 30, 75, 90); ocn = B(cube, -50, -35, -180, -120)
        out.append(f"Clean vs hazy: Indo-Gangetic Plain 22-30N 75-90E mean AOD {np.nanmean(ind):.3f} vs remote South Pacific 50-35S {np.nanmean(ocn):.3f} (expect Indo-Gangetic much higher).")
    elif pid == "tws_grace":
        gl = B(cube, 65, 80, -60, -20); an = B(cube, -90, -70, -180, 180); ind = B(cube, 25, 32, 72, 82)
        for nm, s in (("Greenland 65-80N 60-20W", gl), ("Antarctica 90-70S", an), ("northern India 25-32N 72-82E", ind)):
            y = L.yearly(s, times); ys = sorted(y); k = np.polyfit(ys, [y[a] for a in ys], 1)[0]
            out.append(f"{nm}: simple line through yearly means of cm equivalent water height {k:+.2f} cm/yr (expect negative; Greenland and Antarctica losing ice, northern India aquifer depletion).")
        out.append("Gap check: months with no data = " + ", ".join(f"{y}-{m:02d}" for i, (y, m) in enumerate(times) if not np.isfinite(cube[i]).any()))
    elif pid == "lst_day_myd11":
        nh = B(cube, 20, 60, -180, 180); sa = B(cube, 15, 30, -10, 40)
        out.append(f"Seasonal cycle: Northern land 20-60N JJA {L.season_mean(nh, times, jja):.1f} vs DJF {L.season_mean(nh, times, djf):.1f} degC (expect JJA much warmer); Sahara 15-30N JJA {L.season_mean(sa, times, jja):.1f} degC (expect above 40).")
        am = B(cube, -10, 5, -70, -55)
        out.append(f"Amazon 10S-5N mean {np.nanmean(am):.1f} degC (expect about 28-34, little seasonal range).")
    elif pid == "snow_mod10cm":
        nh = B(cube, 50, 70, -180, 180); am = B(cube, -10, 5, -70, -55)
        out.append(f"Seasonal cycle: Northern land 50-70N snow cover DJF {L.season_mean(nh, times, djf):.1f}% vs JJA {L.season_mean(nh, times, jja):.1f}% (expect DJF far higher); Amazon {np.nanmean(am):.2f}% (expect about 0).")
    return out
