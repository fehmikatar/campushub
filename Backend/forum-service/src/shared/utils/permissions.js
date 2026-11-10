const isModerator = (user) => user.role === 'ENSEIGNANT' || user.role === 'ADMIN';
const isOwnerOrModerator = (user, authorId) => user.id === authorId || isModerator(user);

module.exports = { isModerator, isOwnerOrModerator };