import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';

export default function NotFoundScreen() {
    const router = useRouter();

    useEffect(() => {
        // Redirect to home if page not found
        router.replace('/');
    }, [router]);

    return (
        <>
            <Stack.Screen options={{ title: 'Loading...' }} />
            <View style={styles.container}>
                <Text style={styles.title}>Resuming specific route...</Text>
                <TouchableOpacity onPress={() => router.replace('/')} style={styles.link}>
                    <Text style={styles.linkText}>Go Home</Text>
                </TouchableOpacity>
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        backgroundColor: '#1e1e1e',
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 20,
    },
    link: {
        marginTop: 15,
        paddingVertical: 15,
    },
    linkText: {
        fontSize: 14,
        color: '#1db954',
    },
});
