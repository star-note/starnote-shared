import type { ReactNode } from 'react';

import { LockIcon } from './icons';
import { type Device, VIEWPORT } from './platforms';
import { Scaled } from './Scaled';

/** A phone (bezel + status bar) or a browser window (address bar) around a scaled article page. */
export function DeviceFrame({
  device,
  url,
  label,
  children,
}: {
  device: Device;
  url: string;
  label: string;
  children: ReactNode;
}) {
  const vp = VIEWPORT[device];
  if (device === 'mobile') {
    return (
      <div className="pv-phone" data-device="mobile">
        <div className="pv-phone-screen">
          <div className="pv-status" aria-hidden="true">
            <b>9:41</b>
            <span>
              <i />
              <i />
              <i />
            </span>
          </div>
          <Scaled width={vp.w} height={vp.h} label={label}>
            {children}
          </Scaled>
        </div>
      </div>
    );
  }
  return (
    <div className="pv-browser" data-device="pc">
      <div className="pv-browser-bar" aria-hidden="true">
        <span className="pv-lights">
          <i />
          <i />
          <i />
        </span>
        <span className="pv-url">
          <LockIcon />
          {url}
        </span>
      </div>
      <Scaled width={vp.w} height={vp.h} label={label}>
        {children}
      </Scaled>
    </div>
  );
}
