import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { GeoTerraProvider } from "./context/GeoTerraContext";
import { AboutMethodPage } from "./pages/AboutMethodPage";
import { AlertsReportsPage } from "./pages/AlertsReportsPage";
import { FloodMonitorPage } from "./pages/FloodMonitorPage";
import { FloodPredictionPage } from "./pages/FloodPredictionPage";
import { ImpactValuePage } from "./pages/ImpactValuePage";
import { LakeMonitoringPage } from "./pages/LakeMonitoringPage";
import { PredictionEnginePage } from "./pages/PredictionEnginePage";
import { UrbanExpansionPage } from "./pages/UrbanExpansionPage";
import { EnvironmentSuitePage } from "./pages/EnvironmentSuitePage";
import { ModelDataPage } from "./pages/ModelDataPage";
import { OverviewPage } from "./pages/OverviewPage";
import { SimulationPage } from "./pages/SimulationPage";

export const App: React.FC = () => (
  <BrowserRouter>
    <GeoTerraProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/engine" element={<PredictionEnginePage />} />
          <Route path="/flood" element={<FloodMonitorPage />} />
          <Route path="/predict" element={<FloodPredictionPage />} />
          <Route path="/lakes" element={<LakeMonitoringPage />} />
          <Route path="/urban" element={<UrbanExpansionPage />} />
          <Route path="/hazards" element={<EnvironmentSuitePage initialTab="heat" />} />
          <Route path="/heat" element={<EnvironmentSuitePage initialTab="heat" />} />
          <Route path="/infrastructure" element={<EnvironmentSuitePage initialTab="infrastructure" />} />
          <Route path="/change" element={<EnvironmentSuitePage initialTab="change" />} />
          <Route path="/model" element={<ModelDataPage />} />
          <Route path="/impact" element={<ImpactValuePage />} />
          <Route path="/simulation" element={<SimulationPage />} />
          <Route path="/alerts" element={<AlertsReportsPage />} />
          <Route path="/about" element={<AboutMethodPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </GeoTerraProvider>
  </BrowserRouter>
);

export default App;
