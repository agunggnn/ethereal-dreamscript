using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("Ethereal Dreamscript Studio")]
[assembly: AssemblyDescription("Background launcher and system tray daemon for Ethereal Dreamscript Studio")]
[assembly: AssemblyProduct("Ethereal Dreamscript Studio")]
[assembly: AssemblyVersion("0.3.0.0")]

namespace DreamscriptLauncher
{
    static class Program
    {
        private const int Port = 4747;
        private static readonly string BaseUrl = "http://localhost:" + Port;
        private static readonly string PingUrl = "http://127.0.0.1:" + Port + "/api/ping";
        private static string RootDir;
        private static string PidFile;
        private static string LogFile;
        private static NotifyIcon TrayIcon;

        [STAThread]
        static int Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            RootDir = ResolveRootDir();
            PidFile = Path.Combine(RootDir, "mcp", "studio-server.pid");
            LogFile = Path.Combine(RootDir, "mcp", "studio-server.log");

            bool flagStop = HasArg(args, "--stop") || HasArg(args, "/stop");
            bool flagRestart = HasArg(args, "--restart") || HasArg(args, "/restart");
            bool flagBackground = HasArg(args, "--background") || HasArg(args, "--silent") || HasArg(args, "/background");
            bool flagHeadless = HasArg(args, "--headless") || HasArg(args, "--no-tray");

            if (flagStop)
            {
                StopServer();
                return 0;
            }

            if (flagRestart)
            {
                StopServer();
                Thread.Sleep(250);
            }

            bool ok = EnsureServerRunning();
            if (!ok)
            {
                if (!flagBackground && !flagHeadless)
                {
                    MessageBox.Show(
                        "Could not start mcp\\studio-server.mjs on port " + Port + ".\nCheck " + LogFile + " and ensure Node.js is installed.",
                        "Ethereal Dreamscript Studio",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                }
                return 1;
            }

            if (!flagBackground && !flagHeadless)
            {
                OpenUrl(BaseUrl + "/Home.dc.html");
            }

            if (flagHeadless)
            {
                return 0;
            }

            bool createdNew;
            using (Mutex mutex = new Mutex(true, @"Local\EtherealDreamscriptStudioTray", out createdNew))
            {
                if (!createdNew)
                {
                    // Tray controller is already running in the background.
                    return 0;
                }

                using (Icon icon = BuildBrandIcon())
                {
                    ContextMenuStrip menu = new ContextMenuStrip();
                    var titleItem = new ToolStripMenuItem("Ethereal Dreamscript · :4747") { Enabled = false };
                    menu.Items.Add(titleItem);
                    menu.Items.Add(new ToolStripSeparator());
                    menu.Items.Add("Open Home", null, (s, e) => { EnsureServerRunning(); OpenUrl(BaseUrl + "/Home.dc.html"); });
                    menu.Items.Add("Open Storyboard Studio", null, (s, e) => { EnsureServerRunning(); OpenUrl(BaseUrl + "/Storyboard%20Studio.dc.html"); });
                    menu.Items.Add("Open Realm Builder", null, (s, e) => { EnsureServerRunning(); OpenUrl(BaseUrl + "/Realm%20Builder.dc.html"); });
                    menu.Items.Add("Open Loop Studio", null, (s, e) => { EnsureServerRunning(); OpenUrl(BaseUrl + "/Loop%20Studio.dc.html"); });
                    menu.Items.Add(new ToolStripSeparator());
                    menu.Items.Add("Restart Background Server", null, (s, e) =>
                    {
                        StopServer();
                        Thread.Sleep(200);
                        EnsureServerRunning();
                    });
                    menu.Items.Add("Stop Server && Exit", null, (s, e) =>
                    {
                        StopServer();
                        TrayIcon.Visible = false;
                        Application.Exit();
                    });

                    TrayIcon = new NotifyIcon
                    {
                        Icon = icon,
                        Text = "Ethereal Dreamscript Studio (localhost:4747)",
                        ContextMenuStrip = menu,
                        Visible = true
                    };
                    TrayIcon.DoubleClick += (s, e) =>
                    {
                        EnsureServerRunning();
                        OpenUrl(BaseUrl + "/Home.dc.html");
                    };

                    // Keep-alive watchdog timer: ensure studio-server stays alive every 15s
                    System.Windows.Forms.Timer watchdog = new System.Windows.Forms.Timer { Interval = 15000 };
                    watchdog.Tick += (s, e) =>
                    {
                        if (!IsServerAlive())
                        {
                            StartServerProcess();
                        }
                    };
                    watchdog.Start();

                    Application.Run();
                }
            }
            return 0;
        }

        private static bool HasArg(string[] args, string target)
        {
            foreach (string a in args)
            {
                if (string.Equals(a, target, StringComparison.OrdinalIgnoreCase)) return true;
            }
            return false;
        }

        private static string ResolveRootDir()
        {
            string envRoot = Environment.GetEnvironmentVariable("DREAMSCRIPT_ROOT");
            if (!string.IsNullOrEmpty(envRoot) && File.Exists(Path.Combine(envRoot, "mcp", "studio-server.mjs")))
            {
                return Path.GetFullPath(envRoot);
            }

            string exeDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            if (File.Exists(Path.Combine(exeDir, "mcp", "studio-server.mjs")))
            {
                return Path.GetFullPath(exeDir);
            }

            string parent = Path.GetFullPath(Path.Combine(exeDir, ".."));
            if (File.Exists(Path.Combine(parent, "mcp", "studio-server.mjs")))
            {
                return parent;
            }

            return exeDir;
        }

        private static bool IsServerAlive()
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(PingUrl);
                req.Method = "GET";
                req.Host = "localhost:" + Port;
                req.Timeout = 800;
                using (HttpWebResponse res = (HttpWebResponse)req.GetResponse())
                {
                    return res.StatusCode == HttpStatusCode.OK;
                }
            }
            catch
            {
                return false;
            }
        }

        private static bool EnsureServerRunning()
        {
            if (IsServerAlive()) return true;
            StartServerProcess();
            for (int i = 0; i < 30; i++)
            {
                Thread.Sleep(150);
                if (IsServerAlive()) return true;
            }
            return IsServerAlive();
        }

        private static string FindNodeExe()
        {
            string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string candidate = Path.Combine(pf, "nodejs", "node.exe");
            if (File.Exists(candidate)) return candidate;

            string pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
            foreach (string dir in pathEnv.Split(Path.PathSeparator))
            {
                if (string.IsNullOrWhiteSpace(dir)) continue;
                try
                {
                    string p = Path.Combine(dir.Trim(), "node.exe");
                    if (File.Exists(p)) return p;
                }
                catch { }
            }
            return "node.exe";
        }

        private static void StartServerProcess()
        {
            string script = Path.Combine(RootDir, "mcp", "studio-server.mjs");
            if (!File.Exists(script)) return;

            ProcessStartInfo psi = new ProcessStartInfo
            {
                FileName = FindNodeExe(),
                Arguments = "\"" + script + "\"",
                WorkingDirectory = RootDir,
                CreateNoWindow = true,
                UseShellExecute = false,
                WindowStyle = ProcessWindowStyle.Hidden,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };
            psi.EnvironmentVariables["DREAMSCRIPT_ROOT"] = RootDir;
            psi.EnvironmentVariables["PORT"] = Port.ToString();

            Process p = new Process { StartInfo = psi };
            p.OutputDataReceived += (s, e) => AppendLog(e.Data);
            p.ErrorDataReceived += (s, e) => AppendLog(e.Data);
            p.Start();
            p.BeginOutputReadLine();
            p.BeginErrorReadLine();

            try
            {
                File.WriteAllText(PidFile, p.Id.ToString());
            }
            catch { }
        }

        private static void AppendLog(string line)
        {
            if (string.IsNullOrEmpty(line)) return;
            try
            {
                File.AppendAllText(LogFile, "[" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "] " + line + Environment.NewLine);
            }
            catch { }
        }

        private static void StopServer()
        {
            try
            {
                if (File.Exists(PidFile))
                {
                    int pid;
                    if (int.TryParse(File.ReadAllText(PidFile).Trim(), out pid))
                    {
                        try
                        {
                            Process p = Process.GetProcessById(pid);
                            if (!p.HasExited) p.Kill();
                        }
                        catch { }
                    }
                    File.Delete(PidFile);
                }
            }
            catch { }
        }

        private static void OpenUrl(string url)
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = url,
                    UseShellExecute = true
                });
            }
            catch { }
        }

        private static Icon BuildBrandIcon()
        {
            try
            {
                string icoPath = Path.Combine(RootDir, "assets", "icon.ico");
                if (File.Exists(icoPath))
                {
                    return new Icon(icoPath, new Size(32, 32));
                }
                Icon assoc = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location);
                if (assoc != null) return assoc;
            }
            catch { }

            using (Bitmap bmp = new Bitmap(32, 32))
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                using (LinearGradientBrush bg = new LinearGradientBrush(
                    new Rectangle(0, 0, 32, 32),
                    Color.FromArgb(28, 40, 48),
                    Color.FromArgb(42, 106, 152),
                    45f))
                {
                    g.FillEllipse(bg, 1, 1, 30, 30);
                }
                using (Pen border = new Pen(Color.FromArgb(201, 164, 92), 2f))
                {
                    g.DrawEllipse(border, 2, 2, 28, 28);
                }
                using (Font f = new Font("Segoe UI", 10f, FontStyle.Bold, GraphicsUnit.Pixel))
                using (Brush fg = new SolidBrush(Color.FromArgb(255, 251, 240)))
                {
                    StringFormat sf = new StringFormat
                    {
                        Alignment = StringAlignment.Center,
                        LineAlignment = StringAlignment.Center
                    };
                    g.DrawString("DS", f, fg, new RectangleF(0, 1, 32, 32), sf);
                }
                IntPtr hIcon = bmp.GetHicon();
                return Icon.FromHandle(hIcon);
            }
        }
    }
}
