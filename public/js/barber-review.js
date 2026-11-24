
document.addEventListener("DOMContentLoaded", () => {
  const ratingInput = document.querySelector("#rating");
  const stars = [...document.querySelectorAll(".star-button")];
  const ratingLabel = document.querySelector("#rating-label");

  if (!ratingInput || !stars.length || !ratingLabel) return;

  const labels = {
    1: "Poor",
    2: "Fair",
    3: "Good",
    4: "Very good",
    5: "Excellent"
  };

  function updateStars(rating) {
    stars.forEach((star) => {
      const value = Number(star.dataset.rating);
      const active = value <= rating;

      star.classList.toggle("is-active", active);
      star.setAttribute(
        "aria-pressed",
        String(value === rating)
      );
    });

    ratingLabel.textContent = labels[rating];
  }

  stars.forEach((star) => {
    star.addEventListener("click", () => {
      ratingInput.value = star.dataset.rating;
      updateStars(Number(ratingInput.value));
    });

    star.addEventListener("mouseenter", () => {
      const rating = Number(star.dataset.rating);

      stars.forEach((item) => {
        item.classList.toggle(
          "is-hovered",
          Number(item.dataset.rating) <= rating
        );
      });
    });

    star.addEventListener("focus", () => {
      stars.forEach((item) => {
        item.classList.toggle(
          "is-hovered",
          Number(item.dataset.rating) <= Number(star.dataset.rating)
        );
      });
    });
  });

  const starContainer = document.querySelector(".star-rating");

  starContainer.addEventListener("mouseleave", () => {
    stars.forEach((star) => star.classList.remove("is-hovered"));
  });

  starContainer.addEventListener("focusout", () => {
    setTimeout(() => {
      if (!starContainer.contains(document.activeElement)) {
        stars.forEach((star) => star.classList.remove("is-hovered"));
      }
    }, 0);
  });

  updateStars(Number(ratingInput.value) || 5);
});
