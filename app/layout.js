export const metadata = {
  title: "Visor - Expediente C.S. Chijnaya",
  description: "Monitoreo de avance del expediente tecnico",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#0f1420" }}>
        {children}
      </body>
    </html>
  );
}
