import React, { useState, useEffect, useRef } from 'react';
import { staticGridData } from '../staticDataForTesting/staticData';
import { VictoryLine, VictoryChart, VictoryAxis, VictoryScatter } from 'victory';
import { Card, Icon, Checkbox } from 'semantic-ui-react';
import WeatherCard from './WeatherCard';
import LoaderFish from './LoaderFish';
import ArrowPoint from './chart/ArrowPoint';
import { useGoogleMap2, useGoogleAutocomplete } from '../utilities/hooks';
import { DateTime, Duration } from 'luxon';

import '../App.css';
import { isNonEmptyArray } from '@apollo/client/utilities';


// 33.4672,-117.6981
// water 33.408922,-117.838593monotoneX

// return meta about a point
// https://api.weather.gov/points/33.408922%2C-117.838593


// if marine forecast not support message, hit the grid data for detailed marine data
// "forecastGridData": "https://api.weather.gov/gridpoints/LOX/164,13",


// successful response to first fetch should give various forecast urls
// properties: 
// forecast: "https://api.weather.gov/gridpoints/SGX/22,36/forecast"
// forecastGridData: "https://api.weather.gov/gridpoints/SGX/22,36"
// forecastHourly: "https://api.weather.gov/gridpoints/SGX/22,36/forecast/hourly"
// forecastOffice: "https://api.weather.gov/offices/SGX"
// forecastZone: "https://api.weather.gov/zones/forecast/PZZ775"

const selectLocationButton = document.createElement('button');
selectLocationButton.classList.add('custom-map-control-button');
selectLocationButton.innerHTML='Get Weather';

    // function to determine if value is between min (not inclusive) and max (inclusive)
    const inRange = (value, min, max) => {
      return value >= min && value < max;
    };
    // function to process the color for the scatter points
    const processColor = (datum, label) => {
      // datum is a data point in the format of { startTime: <Object>, value: float}, and label is a string (eg 'swell height')
      const { y: value } = datum;
      console.log(label, value);
      switch (label) {
        case 'swell height':
          if (inRange(value, -1, 1)) return '#00FF00';
          if (inRange(value, 1, 2)) return '#fff33b';
          if (inRange(value, 2, 3)) return '#fdc70c';
          if (inRange(value, 3, 4)) return '#f3903f';
          if (inRange(value, 4, 5)) return '#ed683c';
          if (value > 5) return '#e93e3a';
          break;
          case 'wind speed':
            if (inRange(value, -1, 4)) return '#00FF00';
            if (inRange(value, 4, 8)) return '#fff33b';
            if (inRange(value, 8, 12)) return '#fdc70c';
            if (inRange(value, 12, 16)) return '#f3903f';
            if (inRange(value, 16, 20)) return '#ed683c';
            if (value > 20) return '#e93e3a';
            break;
            case 'temperature':
              if (value < 0) return '#800080'; // purple
              if (inRange(value, -1, 30)) return '#000068'; // blue black
              if (inRange(value, 30, 40)) return '#0000A3'; // dark blue
              if (inRange(value, 40, 60)) return '#7D7DFF'; // light blue
              if (inRange(value, 60, 70)) return '#004200'; // dark green
              if (inRange(value, 70, 80)) return '#339933'; // light green
              if (inRange(value, 80, 90)) return '#FFA500'; // orange
              if (inRange(value, 90, 100)) return '#FF0000'; // red
              if (value > 100) return '#530000'; // dark red
              break;
        default: 
          return 'red';
      }
    };


const WeatherFeed = (props) => {
  const gradientRef = useRef(null);

  const defaultFetchStatus = { loading: true, error: null };
  const defaultWeatherData = { type: null, data: null, position: null };

  // temporary for getting the grid forecast going
  const [processedGridData, setProcessedGridData] = useState(null);

  const [weatherData, setWeatherData] = useState(defaultWeatherData);
  const [fetchStatus, setFetchStatus] = useState(defaultFetchStatus);
  
  const [weatherFilters, setWeatherFilters] = useState({ windSpeed: true, temperature: true, swellHeight: true, skyCover: false, windWaveHeight: false });

  const additonalControls = [{ position: 'BOTTOM_CENTER', element: selectLocationButton, listeners: [{event: 'click', callback: handleSelectLocationButtonClick}] }];
  const { loadMap, showInfoWindowInCenter, mapContainerRef, mapRef, infoWindowRef, apiStatus, mapLoaded, getPosition, geolocationStatus } = useGoogleMap2(true, additonalControls, null, true, null, 8);
  const { autocompleteInputRef, autocompleteRef, loadAutocomplete } = useGoogleAutocomplete(handlePlaceSelect);

  // controls.push({ position: 'BOTTOM_CENTER', element: selectLocationButton, listeners: [{event: 'click', callback: handleSelectLocationButtonClick}] })

  //https://api.weather.gov/gridpoints/SGX/44,52/forecast

  // once the api script is loaded load the map
  useEffect(() => {
    console.log('map load use effect triggered')
    if (!mapLoaded && apiStatus.complete) {
      loadMap();
      loadAutocomplete();
      getPosition();
    }
  }, [mapLoaded, apiStatus.complete, loadMap, getPosition, loadAutocomplete]);
  
  // get forecast if geolocation position comes through
  useEffect(() => {
    console.log('geolocation status use effect triggered')
    if (geolocationStatus.position) {
      getForecast(geolocationStatus.position);
    }
  }, [geolocationStatus]);
  


  // type defaults to forecast. If forecast is unavailable, or we get a marine error in the second fetch, we will fetch and display grid forecastGridData
  const getForecastUrl = async (pos) => {
    setFetchStatus(defaultFetchStatus);
    setWeatherData(defaultWeatherData);
    let forecastUrl = { standard: null, grid: null };
    // status for the first api call to get the point data which should include forecast urls
    let error = null;
    await fetch(`https://api.weather.gov/points/${pos.lat},${pos.lng}`)
      .then (res => {
        if (!res.ok) {
          error = true;
        }    
        return res.json();      
      })
      .then (json => {
        // failed to get any data from first fetch
        if (error) {
          error = true;
          return null;
        }
        // setLocationDetails({city: jsonData.properties.relativeLocation.properties.city, state: jsonData.properties.relativeLocation.properties.state });
        forecastUrl = {standard: json.properties.forecast, grid: json.properties.forecastGridData}
      })  
      .catch(error => {
        // console.log(error);
        // setFetchStatus({loading: false, error: { message: 'Failed to retreive data from NOAA'} });
      });
    return { url: forecastUrl, error };
  };

  
  const getGridForecast = async gridUrl => {
    let fetchSuccess = false;
    await fetch(gridUrl)
      .then(response => {
        if (response.ok) {
          fetchSuccess = true;
        }
        return response.json()
      })
      .then(json => {
        if (fetchSuccess) {
          setFetchStatus({ loading: false, error: null });
          setWeatherData({ type: 'grid', data: json.properties });
        //   console.log(JSON.stringify(json.properties, null, 4))
          processGridData(json.properties);
        } else {
          // handle errors in grid forecast response
          if (json.status === 500) {
            setFetchStatus({ loading: false, error: { code: 500, message: 'Weather server error, please try again later' }})
          }
          if (json.status === 404) {
            setFetchStatus({ loading: false, error: { code: 404, message: 'Forecast unavailable for this location' } })
          }
        }
      })
      .catch(err => console.log(err));
  };

  const getForecast = async pos => {
    // first fetch request gets the appropriate forecast URL.
    const forecastUrl = await getForecastUrl(pos);
    // console.log(forecastUrl);

    // no errors getting the url
    if (!forecastUrl.error) {
      // a standard forecast url is available
      const { standard, grid } = forecastUrl.url;
      if (standard) {
        await fetch(standard)
        .then (response => {
          return response.json()
        })
        .then (jsonData => {
          // periods forecast available
          if (jsonData.properties && jsonData.properties.periods) {
            setFetchStatus({ loading: false, error: false, type: 'periods' });
            setWeatherData({ type: 'periods', data: [...jsonData.properties.periods] });
          } else {
            // periods unavailable for this location, try grid
            if (grid) {
              getGridForecast(grid);
            } else {
              // grid url also unavailable, so can't get weather for this location
              setFetchStatus({loading: false, error: { message: 'Forecast unavailable for this location' } })
            }

          }
        })
        .catch(error => {
          console.log(`error: ${error}`)
          setFetchStatus({loading: false, error: true});
        });    
      } 
      // standard forecast url not available, check for grid url
      else if (grid) { 
        getGridForecast(grid);
      } else {
        // no forecast urls available for this position, so cant get weather for this location
        setFetchStatus({ loading: false, error: { message: 'Forecast unavailable for this location' } });
      }    
    } else {
      // error getting forecast url
      setFetchStatus({ loading: false, error: { message: 'Unable to retreive forecast from server. Please try again later' } });
    }
  };

  // useEffect(() => {
  //   navigator.geolocation.getCurrentPosition(pos => {
  //     getForecast({ lat: pos.coords.latitude, lng: pos.coords.longitude });
  //   }, error => console.log(error));
  // }, [geolocationStatus.position]);

  // useEffect(() => {
  //   console.log('getposition function triggered useEffect')
  // }, [getPosition])


  function handleSelectLocationButtonClick() {
    getForecast(mapRef.current.getCenter().toJSON());
  }

  // function to flatten the grid data object into an array of days with all data types for each day
  function processGridData (forecastData = staticGridData) {
    // first construct and array with object dates for the next few days
    const today = DateTime.now();
    const days = [];
    const keysToMap = [ 'primarySwellHeight', 'temperature', 'primarySwellDirection', 'windWaveHeight', 'wavePeriod2', 'secondarySwellDirection', 'secondarySwellHeight', 'wavePeriod', 'waveHeight', 'weather', 'windGust', 'windSpeed', 'windDirection', 'skyCover' ];
    for (let i = 0; i <= 5; i++) {
      // add a day to today's date for each iteration
      const thisDay = today.plus({days: i}).toObject();
      days.push({ date: thisDay });
    }
    // remap the data so it's stored by date

    keysToMap.forEach(key => {
      // push an empty array for this forecast key into each day
      days.forEach(dayObject => dayObject[key] = []);
      // if there's data for this forecast component, then map it back to days
      if (forecastData[key].values.length > 0){
        forecastData[key].values.forEach(dataPoint => {

          // first get an array of date objects with a unique day
          // final processed data should look like this:
          /* 
          [
            { 
              date: {year, month, day},
              temperature: [{startTime, tempValue}, {startTime, tempValue}]
            }
          ] 
          */

          const [isoTime, isoDuration] = dataPoint.validTime.split('/');
          const startTime = DateTime.fromISO(isoTime);
          const durationInHours =  Duration.fromISO(isoDuration).shiftTo('hours').toObject().hours;
          // console.log(`key: ${key}, time: ${JSON.stringify(isoTime)}, duration: ${JSON.stringify(durationInHours)}`);
          
          // if there is a duration longer than 1h, we need to create an array of new data points containing a new data point for each hour of the duration
          for (let i = 0; i < durationInHours; i++) {
            // add an hour to the start time for every iteration to get a new hour timepoint so we can spread the data over the duration
            const currentInterval = startTime.plus({ hours: 1 * i }).toObject();
            // find the day in the days array that matches the the day of our current one hour interval
            const dayIndex = days.findIndex(item => item.date.year === currentInterval.year && item.date.day === currentInterval.day && item.date.month === currentInterval.month );
            // console.log(dayIndex);
            // console.log(days);
            // console.log(currentInterval.day);
            
            if (dayIndex > -1) {
              // // add the data to the appropriate day
              // console.log(`start time: ${JSON.stringify(currentInterval)}, key: ${key}, value: ${dataPoint.value}`)
              // console.log(days[dayIndex][key])
              days[dayIndex][key].push({ startTime: currentInterval, value: dataPoint.value });
              // days[dayIndex][key].push(currentInterval);

            }  
          }
        });
      }
    });
    // set max and min temp for each day
    days.forEach(day => {
      if (day.temperature.length > 0) {
        // extract the temps for the day
        const dailyTemps = day.temperature.map(temperatureObject => temperatureObject.value)
        day.tempHigh = Math.max(...dailyTemps);
        day.tempLow = Math.min(...dailyTemps);
      }
    })
    // console.log(days);
    setProcessedGridData(days);
  };

  // generate a chart from processed grid data
  function generateLineChart(data, label, unit, valueMultiplier = 1, valueAdded = 0) {
    // data argument given as an array
    // for charts that only need a single data set, like temperature, the array has 1 item
    // for charts like wind speed that have both a speed and direction component, there will be two datasets
    // process data input array and remove the array if only 1 datapoint

    let supplementaryData = null;
    if (data.length > 0) {
      supplementaryData = data[1];
    }
    data = data[0];

    const processedData = [];
    data.forEach(dataObject => {
      const hour = dataObject.startTime.hour;
      processedData.push({ x: hour, y: dataObject.value * valueMultiplier + valueAdded });
      // if (label==='swell height') {
      //   console.log(`Swell height for ${dataObject.startTime.month}-${dataObject.startTime.day}: ${dataObject.value}`);
      // }
    });

    // if we have supplementary data like wind direction, let's add that to the processedData so we can render it on the chart
    if (supplementaryData) {
      supplementaryData.forEach(supplementaryDataObject => {
        // find the x point with the same hour as our supplementary point
        const processedDataIndexToAppendTo = processedData.findIndex(processedDataObject => processedDataObject.x === supplementaryDataObject.startTime.hour);
        if (processedDataIndexToAppendTo > -1) {
          // add a z value to the processedData object (z is the supplementary data value)
          processedData[processedDataIndexToAppendTo]['z'] = supplementaryDataObject.value;
        }
      })
    }
    
    // handle special cases where we have components to the data
    if (label === 'wind speed' || label === 'swell height') {
      // wind speeds contained in processedData
      // wind direction contained in supplementaryData

      return (
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
        <span><b>{`${label} in ${unit}`}</b></span>
        <VictoryChart 
          height={150} 
          padding={{top: 10, left: 30, right: 30, bottom: 30}}
          minDomain={{ y: Math.min(...processedData.map(object => object.y)) * 0.5 }}
          maxDomain={{ y: Math.max(...processedData.map(object => object.y)) * 1.2 }}
        >
          <VictoryAxis 
            tickValues={[0, 6, 12, 18, 23]} 
            tickFormat={t => {
              switch (t) {
                case 0:
                  return '12AM';
                case 6:
                  return '6AM';
                case 12:
                  return '12PM';
                case 18:
                  return '6PM';
                case 23:
                  return '11PM';
                default: 
                  return null;
              }
            }}
            style={{
              axis: {stroke: "#756f6a"},
              ticks: {stroke: "grey", size: 5},
              tickLabels: {fontSize: 14, padding: 0}
            }} 
          />
          <VictoryAxis 
            dependentAxis={true}
            style={{
              padding: {top: 20, bottom: 50},
              axis: {stroke: "#756f6a"},
              ticks: {stroke: "grey", size: 5},
              tickLabels: {fontSize: 14, padding: 0}
            }} 
          />

          <VictoryScatter x='x' y='y' domain={{ x: [0, 23] }} 
            data={processedData} 
            dataComponent={<ArrowPoint dataType={label} directions={supplementaryData} />}
            // labels={({datum}) => datum.z}
            style={{ 
              data: {
                // stroke: ({ datum }) => {
                //   // console.log(datum);
                //   return datum.y < 6 ? "red" : "black"
                // }
              }
            }}
          />
        </VictoryChart>
      </div>

      );

    } else {
      return (
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
          <span><b>{`${label} in ${unit}`}</b></span>
          <VictoryChart 
            height={150} 
            padding={{top: 10, left: 30, right: 30, bottom: 30}}
            minDomain={{ y: 0 }}
            maxDomain={{ y: Math.max(...processedData.map(object => object.y)) * 1.1 }}
          >
            <VictoryAxis 
              tickValues={[0, 6, 12, 18, 23]} 
              tickFormat={t => {
                switch (t) {
                  case 0:
                    return '12AM';
                  case 6:
                    return '6AM';
                  case 12:
                    return '12PM';
                  case 18:
                    return '6PM';
                  case 23:
                    return '11PM';
                  default: 
                    return null;
                }
              }}
              style={{
                axis: {stroke: "#756f6a"},
                ticks: {stroke: "grey", size: 5},
                tickLabels: {fontSize: 14, padding: 0}
              }} 
            />
            <VictoryAxis 
              dependentAxis={true}
              style={{
                padding: {top: 20, bottom: 50},
                axis: {stroke: "#756f6a"},
                ticks: {stroke: "grey", size: 5},
                tickLabels: {fontSize: 14, padding: 0}
              }} 
            />
            
            <VictoryLine interpolation='monotoneX' x='x' y='y' domain={{x: [0, 23]}} data={processedData}  
              style={{ 
                data: {
                  stroke: 'grey',
                  strokeWidth: 1,
                  // stroke: "url(#myGradient)",
              //   // fill: ({ index }) => +index % 2 === 0 ? "blue" : "grey",
              //   // stroke: ({ data }) => console.log(a)
              //   //   stroke: ({ datum }) => {
              //   //     console.log(datum);
              //   //     return datum.y < 6 ? "red" : "black"
              //   //   }
                }
              }}
            />
            {/* {mapGradient} */}
            <VictoryScatter x='x' y='y' domain={{x: [0, 23]}} data={processedData} 
              style={{ 
                data: {
                  fill: ({ datum }) => processColor(datum, label),
                  // stroke: ({ datum }) => {
                  //   // console.log(datum);
                  //   return datum.y < 6 ? "red" : "black"
                  // }
                }
              }}
            />  
          </VictoryChart>
        </div>
      );
    }
  }

  /*

            style={{
              axis: {stroke: "#756f6a"},
              axisLabel: {fontSize: 20},
              ticks: {stroke: "grey", size: 5},
              tickLabels: {fontSize: 15, padding: 5}
            }} 
  */

  function handlePlaceSelect() {
    console.log('place select callback')
    // get the place the user selected
    const place = autocompleteRef.current.getPlace();
    console.log(place);
    if (place.geometry && place.geometry.location) {
      // const { lat, lng } = place.geometry.location;
      // center our map on selected place
      mapRef.current.setCenter(place.geometry.location);
      mapRef.current.setZoom(9);
      getForecast(place.geometry.location);
    } else {
      // no place returned, see if the input is in decimal degrees
      const coordinates = { lat: null, lng: null };
      // remove all spaces and split at comma
      let splitString = place.name.replace(/ /g, '').split(',');
      if (splitString.length === 2) {
        // check if potential lat and lng are both numbers within a valid lat and lng range
        if (typeof Number.parseFloat(splitString[0]) === 'number' && Math.abs(Number.parseFloat(splitString[0])) <= 90 ) {
          coordinates.lat = Number.parseFloat(splitString[0]);
        }
        if (typeof Number.parseFloat(splitString[1]) === 'number' && Math.abs(Number.parseFloat(splitString[1])) <= 180 ) {
          coordinates.lng = Number.parseFloat(splitString[1]);
        }
      }
      // 44.3863863,shskhp   poop
      if (coordinates.lat && coordinates.lng) {
        mapRef.current.setCenter(coordinates);
        mapRef.current.setZoom(10);
        getForecast(coordinates);
      } else {
        // display info window for invalid location
        const infoDivStyle = 'padding-bottom: 5px; font-size: 16px;'
        const infoJSX = `
          <div style='width: 400px'>
            <div style='${infoDivStyle}'><b>${place.name} not found</b></div>
            <div style='${infoDivStyle}'>Please select a suggested place from the dropdown</div>
            <div style='${infoDivStyle}'>Or enter gps coordinates in the coodinates field</div>                 
          </div>`;
        showInfoWindowInCenter(infoJSX, mapRef, infoWindowRef);
      }
    }
  }
          


  const renderOptions = () => {
    return processedGridData ? (
      <div style={{marginTop: 10, display: 'flex',flexDirection: 'column'}}> 
      <div style={{display: 'flex', flexWrap: 'wrap', padding: '5px 10px'}}>
        <Checkbox style={{marginBottom: 5, marginLeft: 10}} toggle name='temperature' label='Temperature' checked={weatherFilters.temperature} onChange={(e, { checked, name }) => setWeatherFilters(prevFilters => ({ ...prevFilters, [name]: checked }))}/>
        <Checkbox style={{marginBottom: 5, marginLeft: 10}} toggle name='windSpeed' label='Wind speed' checked={weatherFilters.windSpeed} onChange={(e, { checked, name }) => setWeatherFilters(prevFilters => ({ ...prevFilters, [name]: checked }))}/>
        <Checkbox style={{marginBottom: 5, marginLeft: 10}} toggle name='swellHeight' label='Swell height' checked={weatherFilters.swellHeight} onChange={(e, { checked, name }) => setWeatherFilters(prevFilters => ({ ...prevFilters, [name]: checked }))}/>
      </div>
      <div style={{display: 'flex', flexWrap: 'wrap', padding: '5px 10px'}}>
        <Checkbox style={{marginBottom: 5, marginLeft: 10}} toggle name='skyCover' label='Sky cover' checked={weatherFilters.skyCover} onChange={(e, { checked, name }) =>  setWeatherFilters(prevFilters => ({ ...prevFilters, [name]: checked }))}/>
        <Checkbox style={{marginBottom: 5, marginLeft: 10}} toggle name='windWaveHeight' label='Wind wave height' checked={weatherFilters.windWaveHeight} onChange={(e, { checked, name }) =>  setWeatherFilters(prevFilters => ({ ...prevFilters, [name]: checked }))}/>
      </div>
    </div>
    ) : null;
  };

  return (
    <div style={{display: 'flex',  height: '100%', paddingRight: 75}}>

    <div className='map-container' style={{width: 300, height: 800, position: 'relative'}}>
      <div id='map' ref={mapContainerRef} />

      <input 
        ref={autocompleteInputRef} type='text' 
        placeholder='Search for a place to center map'
        style={{
          display: mapLoaded ? '' : isNonEmptyArray,
          position: 'absolute',
          top: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 300,
          height: 35, 
          margin: 0,
          borderRadius: 5,
          zIndex: 100
        }}
      />

      <div style={{zIndex: 100, position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)'}}>
        {(apiStatus.loading || fetchStatus.loading) && <LoaderFish />}
        {apiStatus.loading && <div style={{fontSize: 16, fontWeight: 'bold', zIndex: 100}}>Loading Map...</div>}
        {fetchStatus.loading && <div style={{fontSize: 16, fontWeight: 'bold', zIndex: 100}}>Loading weather...</div>}
      </div>
      
    </div>


    <div style={{ width: 600, padding: '0px 10px', height: 800, display: 'flex', flexDirection: 'column'}}>
      <div style={{padding: 10}}>
        {!fetchStatus.loading && !fetchStatus.error &&  
          <div style={{fontSize: 20}}>
            {weatherData.type === 'periods' ? <span>Basic forecast</span> : <span>Marine forecast</span>}
          </div>
          }

        {!fetchStatus.loading && !fetchStatus.error && weatherData.type === 'grid' &&
          <div style={{width: '100%'}}> 
            {renderOptions()}
          </div>
        }
      </div>

      <div style={{overflowY: 'auto', padding: 10}}>
      {/* <button type='button' onClick={}>test log</button> */}
      {/* <div style={{border: '1px solid lightgray', borderRadius: '5px'}}>
        {generateLineChart([statticDayData[0].windSpeed, statticDayData[0].windDirection], 'wind speed', 'kn', 1/1.852 )}
      </div> */}

      {fetchStatus.loading && !fetchStatus.error && <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column'}}><LoaderFish/><h1>Loading forecast...</h1></div>}
      
      {!fetchStatus.loading && fetchStatus.error && 
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column'}}>
          <h2>Error loading forecast...</h2>
          {fetchStatus.error.status === 500 && <h3>Weather server error</h3>}
          {fetchStatus.error.message && <h3>{fetchStatus.error.message}</h3>}
        </div>
      }


      {!fetchStatus.loading && !fetchStatus.error && weatherData.type === 'periods' && weatherData.data.slice(0,6).map(period => (
        <WeatherCard key={period.number} weatherImage={period.icon} forecastDay={period.name} shortForecast={period.shortForecast} forecastDescription={period.detailedForecast}/>
      ))}

      {!fetchStatus.loading && !fetchStatus.error && weatherData.type === 'grid' && processedGridData && processedGridData.map(date => 
        <Card fluid key={DateTime.fromObject(date.date).toISODate()} style={{border: '2px solid gray'}}>
          <Card.Content>
            <Card.Header>{DateTime.fromObject(date.date).toLocaleString(DateTime.DATE_MED_WITH_WEEKDAY)}</Card.Header>
            {date.tempHigh && <div><Icon name='thermometer' /> {date.tempHigh*9/5+32}</div>}
            {date.tempLow && <div><Icon name='thermometer empty' /> {date.tempLow*9/5+32}</div>}
            <div style={{display: 'flex', flexDirection: 'column'}}>
              {date.temperature.length > 0 && weatherFilters.temperature &&
                <div style={{border: '1px solid lightgray', borderRadius: '5px', margin: '5px 0px 5px 0px'}}>
                  {generateLineChart([date.temperature], 'temperature', 'deg F', 1.8, 32 )}
                </div>
              }
              {date.skyCover.length > 0 && weatherFilters.skyCover &&
                <div style={{border: '1px solid lightgray', borderRadius: '5px'}}>
                  {generateLineChart([date.skyCover], 'sky cover', '%')}
                </div>
              }              
              {date.windSpeed.length > 0 && weatherFilters.windSpeed &&
                <div style={{border: '1px solid lightgray', borderRadius: '5px'}}>
                 {generateLineChart([date.windSpeed, date.windDirection], 'wind speed', 'kn', 1/1.852 )}
                </div>
              }
              {date.primarySwellHeight.length > 0 && weatherFilters.swellHeight &&
                <div style={{border: '1px solid lightgray', borderRadius: '5px'}}>
                  {generateLineChart([date.primarySwellHeight, date.primarySwellDirection], 'swell height', 'ft', 3.28084)}
                </div>
              }
              {date.windWaveHeight.length > 0 && weatherFilters.windWaveHeight &&
                <div style={{border: '1px solid lightgray', borderRadius: '5px'}}>
                 {generateLineChart([date.windWaveHeight], 'wind wave height', 'ft', 3.28084)}
                </div>
              }
            </div>
          </Card.Content>
        </Card>  
      )}

      </div>

    </div>

    </div>

  );
};

export default WeatherFeed;

//    const keysToMap = ['temperature', 'primarySwellDirection', 'primarySwellHeight', 'windWaveHeight', 'wavePeriod2', 'secondarySwellDirection', 'secondarySwellHeight', 'wavePeriod', 'waveHeight', 'weather', 'windGust', 'windSpeed', 'windDirection', 'skyCover' ];
//2021-06-18T10:00:00.000-07:00




/* 


    function mapGradient() {
      const colors = [];
      data.forEach(dataObject => {
        if (dataObject.value <= 15) {
          colors.push('green');
        } else {
          colors.push('red');
        }
      });
      return (
        <linearGradient ref={gradientRef} id="myGradient">
          <stop offset='0%' stopColor={colors[0]} />
          <stop offset='4.167%' stopColor={colors[1]} />
          <stop offset='8.333%' stopColor={colors[2]} />
          <stop offset='12.5%' stopColor={colors[3]} />
          <stop offset='16.667%' stopColor={colors[4]} />
          <stop offset='20.833%' stopColor={colors[5]} />
          <stop offset='100%' stopColor={colors[6]} />
        </linearGradient>)
    }





            {date.windDirection.length > 0 && 
              <div>
                <span style={{padding: '0px 0px 5px 0px'}}>Wind Direction</span>
                <div style={{display: 'flex'}}>
                  {date.windDirection.map(dataObject => 
                    <div key={JSON.stringify(dataObject.startTime)} style={{display: 'flex', flexDirection: 'column',  alignItems: 'center'}}>
                      <div style={{padding: '0px 5px', fontSize: 13}}>
                        {DateTime.fromObject(dataObject.startTime).toLocaleString(DateTime.TIME_SIMPLE)}
                      </div>
                      <div>
                        {dataObject.value}
                      </div>
                    </div>
                  )}
                </div>
                <div style={{border: '1px solid grey'}}>
                {generateLineChart(date.windDirection, 'wind direction', 'deg')}
                </div>
                
              </div>
            }


// map the detailed temperatures
            {
              date.temperatures.map(tempObj => 
                <div key={DateTime.fromObject(tempObj.startTime).toString()}>
                  <div>{DateTime.fromObject(tempObj.startTime).toLocaleString(DateTime.TIME_SIMPLE)}</div>
                  <div>{tempObj.value} C</div>
                </div>
              )
            }



        <WeatherCard key={date.date}forecastDay={date.date} shortForecast={'placeholder'} 
          forecastDescription={() => {
            date.temperature.map(tempObj => 
              <div>
              <div>{tempObj.startTime.hours}:{tempObj.startTime.minutes}</div>
              <div>{tempObj.value} C</div>
              </div>
            )
          }} 
        /> 














              {date.windSpeed.length > 0 && 
                <div>
                  <span style={{padding: '0px 0px 5px 0px'}}>Wind speed</span>
                  <div style={{display: 'flex'}}>
                    {date.windSpeed.map(dataObject => 
                      <div key={JSON.stringify(dataObject.startTime)} style={{display: 'flex', flexDirection: 'column',  alignItems: 'center'}}>
                        <div style={{padding: '0px 5px', fontSize: 13}}>
                          {DateTime.fromObject(dataObject.startTime).toLocaleString(DateTime.TIME_SIMPLE)}
                        </div>
                        <div>
                          {Math.round(dataObject.value/1.609)} mph
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                   {generateLineChart(date.windSpeed, 'wind speed', 'km/h')}
                  </div>

                </div>
              }





        */




                        /* // create a gradient component for the chart to apply to the line filteredAccessLocation */
          /* <linearGradient id="myGradient"
            <stop offset="0%" stopColor='red'/>
            <stop offset="25%" stopColor="orange"/>
            <stop offset="50%" stopColor="gold"/>
            <stop offset="75%" stopColor="yellow"/>
            <stop offset="100%" stopColor="green"/>
        </linearGradient> */
  
  /* <svg style={{ height: 0 }}>
      <defs>
        <linearGradient id="myGradient">
          <stop offset="0%" stopColor="red"/>
          <stop offset="25%" stopColor="orange"/>
          <stop offset="50%" stopColor="gold"/>
          <stop offset="75%" stopColor="yellow"/>
          <stop offset="100%" stopColor="green"/>
        </linearGradient>
      </defs>
    </svg> */