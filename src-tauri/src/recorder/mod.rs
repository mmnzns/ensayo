//! Mic capture: the chosen input device, resampled to 16 kHz mono, written to a WAV. Cross-platform; OS code lives in `platform/`.

pub mod capture;
pub mod clock;
pub mod feed;
pub mod levels;
pub mod mic;
pub mod pipeline;
pub mod resample;
pub mod source;
pub mod timeline;
pub mod wav;
