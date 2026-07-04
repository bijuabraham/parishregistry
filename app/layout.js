import "./globals.css";

export const metadata = {
  title: "Parish Registry & Analytics - Mar Thoma Church Of San Francisco",
  description: "Parish Registry directory, spatial analysis, demographics, and interactive statistics dashboard for the Mar Thoma Church Of San Francisco.",
  keywords: "church registry, parish database, congregation analysis, Livermore CA, Mar Thoma Church",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body suppressHydrationWarning>
        <div className="app-container">
          <header className="app-header" id="app-header-main">
            <div className="header-brand">
              <div className="logo-container">
                <img 
                  src="/logocolor.png" 
                  alt="Mar Thoma Church Logo" 
                  width="56" 
                  height="56" 
                  className="church-logo" 
                  id="church-logo-img"
                />
              </div>
              <div className="brand-text">
                <h1>Mar Thoma Church Of San Francisco</h1>
                <p>418 Junction Ave, Livermore, CA 94551</p>
              </div>
            </div>
            <div className="header-vicar" id="header-vicar-info">
              <div className="vicar-label">Vicar</div>
              <div className="vicar-name">Rev. Jijo P. Sunny</div>
            </div>
          </header>
          
          <main id="main-content-area">
            {children}
          </main>
          
          <footer className="app-footer" id="app-footer-main">
            <p>&copy; {new Date().getFullYear()} Mar Thoma Church Of San Francisco · All Rights Reserved</p>
          </footer>
        </div>
      </body>
    </html>
  );
}
