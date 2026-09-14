(() => {
  const createButton = $('createBtn');
  if (!createButton) return;

  const originalCreate = createButton.onclick;
  createButton.onclick = () => {
    const code = $('codeInput')?.value.trim();
    if (code) {
      toast('部屋コードが入力されています。既存の部屋に参加する場合は「部屋に参加」を押してください。');
      return;
    }
    originalCreate?.();
  };
})();
