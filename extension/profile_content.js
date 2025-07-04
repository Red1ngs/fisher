// profile_content.js
(function() {
  // Получаем user_id
  const pathParts = window.location.pathname.split('/');
  const userId = pathParts[2];
  if (!userId) return;

  // Ищем контейнер кнопок профиля
  const controls = document.querySelector('.profile__controls');
  if (!controls) return;

  // Создаём обёртку для кнопки и выпадашки
  const wrapper = document.createElement('div');
  wrapper.classList.add('health-wrapper');
  controls.appendChild(wrapper);

  // Триггер-кнопка
  const toggleBtn = document.createElement('button');
  toggleBtn.classList.add('health-status-toggle');
  toggleBtn.title = 'Изменить статус';
  toggleBtn.innerHTML = '<i class="icon icon-heart"></i>';
  wrapper.appendChild(toggleBtn);

  // Контейнер бейджей
  const badgeContainer = document.createElement('div');
  badgeContainer.classList.add('health-badge-container');
  wrapper.appendChild(badgeContainer);

  // Обработка клика по триггеру
  toggleBtn.addEventListener('click', e => {
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: 'GET_HEALTH_CATEGORY' }, categories => {
      badgeContainer.innerHTML = '';
      Object.entries(categories).forEach(([category, { badge, color }]) => {
        const btn = document.createElement('button');
        btn.classList.add('health-badge-btn');
        btn.textContent = badge;
        btn.title = category;
        btn.style.color = color;

        btn.addEventListener('click', () => {
          chrome.runtime.sendMessage(
            {
              type: 'SET_USER_STATUS',
              data: { user_id: userId, category }
            },
            result => {
              if (result.success) {
                toggleBtn.style.color = color;
              } else {
                console.error('Ошибка установки статуса:', result.error);
              }
              badgeContainer.classList.remove('open');
            }
          );
        });

        badgeContainer.appendChild(btn);
      });
      badgeContainer.classList.toggle('open');
    });
  });

  // Закрываем при клике вне
  document.addEventListener('click', () => {
    badgeContainer.classList.remove('open');
  });
})();
