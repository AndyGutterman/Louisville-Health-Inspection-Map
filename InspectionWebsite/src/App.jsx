import React, { useEffect, useState } from "react";
import DeckGL from "@deck.gl/react";
import { ScatterplotLayer } from "@deck.gl/layers";
import { StaticMap } from "react-map-gl";

function App() {
  const [data, setData] = useState([]);

  useEffect(() => {
    fetch(
      "https://services1.arcgis.com/…/FeatureServer/0/query?where=1=1&outFields=*&returnGeometry=true&f=geojson",
    )
      .then((r) => r.json())
      .then((json) => setData(json.features));
  }, []);

  const layers = [
    new ScatterplotLayer({
      id: "restaurants",
      data,
      getPosition: (f) => f.geometry.coordinates,
      getRadius: 20,
      radiusMinPixels: 3,
      getFillColor: (f) =>
        f.properties.Score_Recent > 90 ? [0, 200, 0] : [200, 0, 0],
      pickable: true,
      onClick: (info) => {
        const props = info.object.properties;
        alert(`${props.premise_name}\nScore: ${props.Score_Recent}`);
      },
    }),
  ];

  return (
    <DeckGL
      initialViewState={{
        longitude: -85.75,
        latitude: 38.25,
        zoom: 11,
      }}
      controller={true}
      layers={layers}
    >
      <StaticMap reuseMaps />
    </DeckGL>
  );
}

export default App;
