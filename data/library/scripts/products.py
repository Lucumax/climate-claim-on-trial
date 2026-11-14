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

NO2_CAV = ("A column is all the NO2 gas in the air above a spot, high up and low down, counted as molecules per square centimetre (here in units of 10^15); it is not the concentration you breathe at street level. "
           "Cloud-screened: only scenes with cloud fraction at most 30% are kept (NASA's own screening), so cloudy places and seasons are under-sampled, and winter at high latitudes has few or no data. "
           "Since 2007 part of the OMI swath has been blocked (the 'row anomaly'); the NASA Level-3 product already drops affected pixels using its own quality flags, so coverage per day is smaller after 2007-2011 and the averages rest on fewer pixels. "
           "OMI passes at about 1:45 PM local time, so this is a mid-afternoon value, and NO2 has a strong daily and seasonal cycle. Monthly values here are the average of the daily cloud-screened grids, kept where at least 5 days are valid.")
AIRS_CAV = ("Retrieved from the infrared sounder AIRS on Aqua together with microwave data, for scenes it can see through partly cloudy skies, so very cloudy places are under-sampled. The surface air temperature here is the mean of the afternoon (about 1:30 PM) and night (about 1:30 AM) overpasses, and is a retrieved value, not a weather-station reading. "
            "Aqua's overpass times have drifted later since July 2021 (NSIDC data announcement, 28 Oct 2021), which can shift both the day and night views a little after 2021. Version 7 replaces older versions, so do not splice with Version 6 values.")
SOIL_CAV = ("MODEL OUTPUT, not a direct observation: the NASA GLDAS Noah land-surface model, driven by satellite- and ground-based weather inputs, computes how much water is in the top 10 cm of soil. It does not measure soil water from space. "
            "The value is the water in a 10 cm soil layer expressed as kg/m2 (the same as mm of water; 100 would mean completely full); frozen soil, forests and bare rock behave differently, and model biases can differ by region. Land only and only between 60S and 90N (no Antarctica). "
            "The forcing data changed over time in GLDAS 2.1, so check that a change is not just a change in the model inputs.")
ET_CAV = ("MODEL OUTPUT, not a direct observation: the NASA GLDAS Noah land-surface model computes evapotranspiration (water leaving the land as evaporation from soil and water plus plant transpiration), in mm per day averaged over the month. "
          "It follows from the model's weather inputs and its vegetation and soil settings, so errors in rain or sunshine inputs carry through. Land only and only between 60S and 90N (no Antarctica). The forcing data changed over time in GLDAS 2.1, so check that a change is not just a change in the model inputs.")

PRODUCTS = {
 "precip_imerg": dict(name="Precipitation (rain and snow)", short="GPM IMERG Final monthly V07 (GPM_3IMERGM)", units="mm/day", scale=0.05, offset=0.0,
    definition="How much rain and snow water reaches the ground, shown as the average amount per day over each month (millimetres of water per day).",
    caveats=IMERG_CAV, source_var="/Grid/precipitation (mm/hr x 24)", kind="satellite observation (multi-satellite, gauge-calibrated)", native="0.1 degree, block-averaged to 1 degree",
    cid="C2723754851-GES_DISC", agency="NASA GES DISC"),
 "aod_myd08": dict(name="Aerosol optical depth (haze)", short="MODIS Aqua MYD08_M3 v6.1", units="1 (unitless)", scale=0.002, offset=0.0,
    definition="How much haze (dust, smoke and pollution particles) blocks sunlight in the whole air column above a place, at green light (550 nm). Near 0.05 is very clean air; above 0.5 is thick haze.",
    caveats=AOD_CAV, source_var="AOD_550_Dark_Target_Deep_Blue_Combined_Mean_Mean", kind="satellite observation", native="1 degree (native)", cid="C1443775657-LAADS", agency="NASA LAADS DAAC"),
 "tws_grace": dict(name="Terrestrial water storage anomaly", short="GRACE and GRACE-FO JPL mascons RL06.3 v04 (CRI)", units="cm (equivalent water height)", scale=0.1, offset=0.0,
    definition="How much more or less water is stored on and under the ground than the 2004-2009 average, written as the height of a layer of water spread over the area (centimetres). Snow, ice, lakes, soil moisture and groundwater all count together.",
    caveats=TWS_CAV, source_var="lwe_thickness", kind="satellite observation (gravity)", native="0.5 degree grid (effective resolution about 3 degrees), block-averaged to 1 degree", cid="C3195527175-POCLOUD", agency="NASA PO.DAAC"),
 "lst_day_myd11": dict(name="Land surface temperature (day)", short="MODIS Aqua MYD11C3 v061", units="degC", scale=0.05, offset=0.0,
    definition="How hot the ground surface is in the early afternoon, as seen from space on clear days, averaged over the month (degrees Celsius). It is hotter than the air temperature in sun-baked places.",
    caveats=LST_CAV, source_var="LST_Day_CMG (K x 0.02 minus 273.15)", kind="satellite observation", native="0.05 degree, block-averaged to 1 degree", cid="C2565794044-LPCLOUD", agency="NASA LP DAAC"),
 "snow_mod10cm": dict(name="Snow cover", short="MODIS Terra MOD10CM v061", units="% of land area", scale=0.1, offset=0.0,
    definition="The share of the ground (in percent) that the satellite saw covered by snow during the month, on days when it could see the ground.",
    caveats=SNOW_CAV, source_var="Coverage of snow", kind="satellite observation", native="0.05 degree, block-averaged to 1 degree", cid="C3050353608-NSIDC_CPRD", agency="NASA NSIDC DAAC"),

 "no2_omi": dict(name="Tropospheric nitrogen dioxide column", short="OMI/Aura OMNO2d v004 (cloud-screened Level-3 daily, averaged to monthly)", units="10^15 molecules/cm2", scale=0.02, offset=0.0,
    definition="How much nitrogen dioxide (NO2, a brown gas made when fuel burns in cars, power plants and industry, and by lightning and fires) sits in the lower atmosphere above a spot, counted as molecules above each square centimetre of ground, in units of one thousand million million (10^15). City and industrial areas are the high spots.",
    caveats=NO2_CAV, source_var="ColumnAmountNO2TropCloudScreened", kind="satellite observation", native="0.25 degree daily, averaged to monthly then block-averaged to 1 degree", cid="C3333493715-GES_DISC", agency="NASA GES DISC"),
 "airs_tair": dict(name="Surface air temperature (day and night mean)", short="AIRS/Aqua L3 monthly standard physical retrieval V7.0 (AIRS3STM)", units="degC", scale=0.1, offset=0.0,
    definition="The temperature of the air near the ground, as estimated by an infrared sounder on the Aqua satellite, averaged over the afternoon and night passes and over the month (degrees Celsius). It works over land and ocean.",
    caveats=AIRS_CAV, source_var="SurfAirTemp_A and SurfAirTemp_D (K, mean of the two minus 273.15)", kind="satellite observation (retrieval)", native="1 degree (native)", cid="C1701805662-GES_DISC", agency="NASA GES DISC"),
 "airs_h2o": dict(name="Total water vapour column", short="AIRS/Aqua L3 monthly standard physical retrieval V7.0 (AIRS3STM)", units="kg/m2 (= mm of water)", scale=0.1, offset=0.0,
    definition="How much water vapour (the invisible gas form of water) is in the whole column of air above a spot, written as the depth of liquid water it would make if it all condensed (millimetres). Warm, humid places have high values, cold dry places low ones.",
    caveats=AIRS_CAV, source_var="TotH2OVap_A and TotH2OVap_D (kg/m2, mean of the two)", kind="satellite observation (retrieval)", native="1 degree (native)", cid="C1701805662-GES_DISC", agency="NASA GES DISC"),
 "soil_gldas": dict(name="Soil moisture, top 10 cm (model)", short="GLDAS Noah land surface model monthly V2.1 (GLDAS_NOAH10_M)", units="kg/m2 (= mm of water in the top 10 cm)", scale=0.05, offset=0.0,
    definition="How much water the soil holds in its top 10 centimetres, written as millimetres of water (100 would be completely full). This is computed by a NASA land-surface model fed with satellite and ground weather data, not measured directly.",
    caveats=SOIL_CAV, source_var="SoilMoi0_10cm_inst", kind="model output (land-surface model driven by observations)", native="1 degree (native)", cid="C1288937542-GES_DISC", agency="NASA GES DISC"),
 "et_gldas": dict(name="Evapotranspiration (model)", short="GLDAS Noah land surface model monthly V2.1 (GLDAS_NOAH10_M)", units="mm/day", scale=0.02, offset=0.0,
    definition="How much water leaves the land and goes into the air each day, by evaporating from soil, puddles and leaves and by plants releasing water vapour (millimetres of water per day, monthly average). Computed by a NASA land-surface model, not measured directly.",
    caveats=ET_CAV, source_var="Evap_tavg (kg/m2/s x 86400)", kind="model output (land-surface model driven by observations)", native="1 degree (native)", cid="C1288937542-GES_DISC", agency="NASA GES DISC"),
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
    elif pid == "no2_omi":
        ind = B(cube, 22, 30, 75, 88); pac = B(cube, -40, -20, -150, -120); sah = B(cube, 15, 25, 0, 30)
        out.append(f"Places (all-month mean, 10^15 molecules/cm2): Indo-Gangetic Plain {np.nanmean(ind):.2f}, remote South Pacific {np.nanmean(pac):.2f}, Sahara {np.nanmean(sah):.2f} (expect IGP clearly above the other two). No trend computed.")
        ne = B(cube, 35, 45, -90, -70)
        out.append(f"Seasonality (means only): eastern US box DJF {L.season_mean(ne, times, djf):.2f} vs JJA {L.season_mean(ne, times, jja):.2f} (expect winter higher because NO2 lasts longer in cold, dark months).")
    elif pid == "airs_tair":
        out.append(f"Orientation: top row (89.5N) mean JJA {np.nanmean(cube[[i for i,(y,m) in enumerate(times) if m in jja]][:, 0]):.1f} vs DJF {np.nanmean(cube[[i for i,(y,m) in enumerate(times) if m in djf]][:, 0]):.1f} degC (expect JJA warmer at the north pole); global area-weighted mean {np.nanmean(L.wmean(cube)):.1f} degC (expect about 14-15).")
        sa = B(cube, 15, 30, -10, 40)
        out.append(f"Sahara 15-30N JJA {L.season_mean(sa, times, jja):.1f} vs DJF {L.season_mean(sa, times, djf):.1f} degC (expect JJA hotter).")
    elif pid == "airs_h2o":
        tr = B(cube, -10, 10, -180, 180); po = B(cube, 70, 90, -180, 180); sa = B(cube, 18, 28, -10, 30)
        out.append(f"Tropics 10S-10N mean {np.nanmean(tr):.1f} vs Arctic 70-90N {np.nanmean(po):.1f} vs Sahara {np.nanmean(sa):.1f} kg/m2 (expect tropics about 40-50, Arctic low, Sahara low).")
    elif pid == "soil_gldas":
        sa = B(cube, 18, 28, -10, 30); am = B(cube, -10, 0, -70, -55)
        out.append(f"Sahara mean {np.nanmean(sa):.1f} vs Amazon {np.nanmean(am):.1f} kg/m2 in the top 10 cm (expect Sahara very low, Amazon high).")
    elif pid == "et_gldas":
        sa = B(cube, 18, 28, -10, 30); am = B(cube, -10, 0, -70, -55); nh = B(cube, 40, 60, -180, 180)
        out.append(f"Amazon {np.nanmean(am):.2f} vs Sahara {np.nanmean(sa):.2f} mm/day (expect Amazon about 3-4, Sahara near 0); northern land 40-60N JJA {L.season_mean(nh, times, jja):.2f} vs DJF {L.season_mean(nh, times, djf):.2f} (expect JJA higher).")
    return out
