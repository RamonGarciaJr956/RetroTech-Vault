async function logout() {
    try {
        const response = await fetch('/auth/signout', {
            method: "POST",
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            body: await fetch('/auth/csrf').then(rs => rs.text())
        });

        if (response.ok) {
            window.location.href = '/';
        } else {
            console.error('Logout failed');
        }
    } catch (error) {
        console.error('Logout error:', error);
    }
}