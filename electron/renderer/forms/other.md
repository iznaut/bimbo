---
title: one-click upload via SFTP
id: other
fields:
    - {
          id: "provider",
          placeholder: "provider name",
          helpText: 'provider name can be anything - just determines how the menu item appears (e.g. "upload to My Cool Webhost")',
      }
    - {
          id: "host",
          helpText: "an URL-like address to your provider (e.g. sftp.mycoolwebhost.com)",
      }
    - {
          id: "port",
          helpText: "port 22 is default for SFTP. don't change this unless your provider uses a different number",
      }
    - {
          id: siteRoot,
          placeholder: "root path",
          helpText: "path to your site's root directory on the hosting server (e.g. /home/public)",
      }
    - {
          id: username,
          helpText: "your SFTP-enabled username (may or may not be different than what you use to login your host's web interface)",
      }
---

most web hosting providers support SFTP (Secure File Transfer Protocol) as an option for uploading files. if your provider supports SFTP, you can configure here:
