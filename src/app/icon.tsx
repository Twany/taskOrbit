import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(160deg, rgba(250,255,252,1) 0%, rgba(226,244,235,1) 100%)",
          borderRadius: 120,
        }}
      >
        <div
          style={{
            width: 280,
            height: 280,
            borderRadius: 999,
            background: "#31cc74",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 20px 60px rgba(49, 204, 116, 0.28)",
          }}
        >
          <div
            style={{
              width: 154,
              height: 154,
              borderRadius: 999,
              border: "18px solid white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 999,
                background: "white",
                position: "absolute",
                top: -4,
                right: 18,
              }}
            />
          </div>
        </div>
      </div>
    ),
    size,
  );
}
