export function compressImage(file: File, maxWidth = 800): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let ratio = 1;
          if (img.width > maxWidth) {
            ratio = maxWidth / img.width;
          }
          canvas.width = Math.max(1, img.width * ratio);
          canvas.height = Math.max(1, img.height * ratio);
          
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error("Cannot get canvas context"));
          
          // Fill white background in case of transparent PNG
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          if (img.width > 0 && img.height > 0) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          }
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
}

export function cropImage(base64: string, box: number[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error("Cannot get canvas context"));
        
        let [ymin, xmin, ymax, xmax] = box || [0,0,1000,1000];
        // Ensure values are numbers
        ymin = Number(ymin) || 0;
        xmin = Number(xmin) || 0;
        ymax = Number(ymax) || 1000;
        xmax = Number(xmax) || 1000;

        // Clamp values between 0 and 1000
        ymin = Math.max(0, ymin);
        xmin = Math.max(0, xmin);
        ymax = Math.min(1000, ymax);
        xmax = Math.min(1000, xmax);
        
        const sx = (xmin / 1000) * img.width || 0;
        const sy = (ymin / 1000) * img.height || 0;
        let sw = ((xmax - xmin) / 1000) * img.width || img.width;
        let sh = ((ymax - ymin) / 1000) * img.height || img.height;
        
        // Prevent strictly zero or negative source dimensions
        sw = Math.max(1, sw);
        sh = Math.max(1, sh);
        
        // Make it a square thumbnail with white background
        const size = Math.max(sw, sh);
        // Let's ensure minimal thumbnail size so padding isn't weird if it's very small
        canvas.width = Math.max(100, size);
        canvas.height = Math.max(100, size);
        
        if (canvas.width === 0 || canvas.height === 0) {
          throw new Error("Invalid canvas size");
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const dx = (canvas.width - sw) / 2;
        const dy = (canvas.height - sh) / 2;
        
        ctx.drawImage(img, sx, sy, sw, sh, dx, dy, sw, sh);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = (error) => reject(error);
  });
}
